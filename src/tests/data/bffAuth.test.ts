import { describe, expect, it, vi } from 'vitest'
import { createApp, defineEventHandler, toWebHandler } from 'h3'
import { createBffHandler } from '../../../server/utils/bffHandler'
import { createTestBffBackend } from '../fixtures/bffBackend'

function setup() {
  let time = Date.now()
  const backend = createTestBffBackend(() => time)
  const handle = toWebHandler(
    createApp().use(defineEventHandler(createBffHandler({ now: () => time, backend }))),
  )
  function browser() {
    let cookie = ''
    let csrf = ''
    let customerId = ''
    return {
      get cookie() {
        return cookie
      },
      async request(path: string, method = 'GET', body?: unknown, headers = {}) {
        const result = await handle(
          new Request(`http://localhost/api/${path}`, {
            method,
            headers: {
              cookie,
              origin: 'http://localhost',
              'x-csrf-token': csrf,
              'x-banking-user': customerId,
              'content-type': 'application/json',
              ...headers,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
          }),
        )
        const setCookie = result.headers.get('set-cookie')
        if (setCookie) cookie = setCookie.split(';')[0]!
        const data = result.status === 204 ? null : await result.json()
        if (data?.csrfToken) {
          csrf = data.csrfToken
          customerId = data.customer?.id ?? ''
        }
        return { status: result.status, data, headers: result.headers }
      },
      async login(email = 'taylor@example.com') {
        await this.request('auth/session')
        return this.request('auth/login', 'POST', { email, password: 'DemoBank!2026' })
      },
    }
  }
  return { backend, browser, advance: (ms: number) => (time += ms) }
}

function gate() {
  let release!: () => void
  let entered!: () => void
  const blocked = new Promise<void>((resolve) => (release = resolve))
  const started = new Promise<void>((resolve) => (entered = resolve))
  return { release, entered, blocked, started }
}

const transfer = {
  idempotencyKey: 'bff-transfer',
  sourceAccountId: 'account-checking',
  destination: { kind: 'OWN_ACCOUNT', accountId: 'account-savings' },
  amountMinor: 1000,
  currency: 'USD',
}

describe('simulated BFF authentication', () => {
  it('keeps tokens on the server and forwards the session token instead of browser credentials', async () => {
    const { browser, backend } = setup()
    const login = vi.spyOn(backend, 'login')
    const upstream = vi.spyOn(backend, 'request')
    const a = browser()
    const b = browser()
    expect((await a.request('accounts')).status).toBe(401)
    const initial = await a.request('auth/session')
    expect(initial.headers.get('set-cookie')).toContain('personal-finance-lab-bff-session=')
    expect(initial.headers.get('set-cookie')).toContain('HttpOnly')
    const anonymous = a.cookie
    const identityA = await a.login()
    const identityB = await b.login('alex@example.com')
    const tokenA = await login.mock.results[0]!.value
    const tokenB = await login.mock.results[1]!.value
    expect(tokenA.accessToken).not.toBe(tokenB.accessToken)
    expect(a.cookie).not.toBe(anonymous)
    for (const response of [identityA, identityB, await a.request('auth/session')]) {
      const serialized = JSON.stringify(response.data) + JSON.stringify([...response.headers])
      for (const token of [tokenA, tokenB]) {
        expect(serialized).not.toContain(token.accessToken)
        expect(serialized).not.toContain(token.refreshToken)
      }
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    }
    const accountsA = await a.request('accounts', 'GET', undefined, {
      authorization: `Bearer ${tokenB.accessToken}`,
    })
    expect(accountsA.status).toBe(200)
    expect(
      accountsA.data.every((item: { ownerId: string }) => item.ownerId === 'customer-taylor'),
    ).toBe(true)
    expect(upstream.mock.calls.at(-1)?.[1]).toBe(`Bearer ${tokenA.accessToken}`)
    expect(
      (await b.request('accounts')).data.every(
        (item: { ownerId: string }) => item.ownerId === 'customer-alex',
      ),
    ).toBe(true)
    expect(upstream.mock.calls.at(-1)?.[1]).toBe(`Bearer ${tokenB.accessToken}`)
    expect((await a.request('accounts', 'GET', undefined, { cookie: anonymous })).status).toBe(401)
    expect((await b.request('accounts/account-checking')).status).toBe(404)
  })

  it('rejects CSRF and stale user mutations before forwarding and revokes only the logged-out session', async () => {
    const { browser, backend } = setup()
    const a = browser()
    const secondSession = browser()
    await a.login()
    await secondSession.login()
    const upstream = vi.spyOn(backend, 'request')
    for (const headers of [{ 'x-csrf-token': '' }, { origin: 'https://evil.example' }])
      expect((await a.request('transfers', 'POST', transfer, headers)).status).toBe(403)
    expect(
      (await a.request('transfers', 'POST', transfer, { 'x-banking-user': 'customer-alex' }))
        .status,
    ).toBe(409)
    expect(upstream).not.toHaveBeenCalled()
    const oldCookie = a.cookie
    expect((await a.request('auth/logout', 'POST')).status).toBe(200)
    expect((await a.request('accounts', 'GET', undefined, { cookie: oldCookie })).status).toBe(401)
    expect((await secondSession.request('accounts')).status).toBe(200)
  })

  it('refreshes expired access tokens once for concurrent requests and uses the rotated token', async () => {
    const { browser, backend, advance } = setup()
    const a = browser()
    await a.login()
    const refresh = backend.refresh.bind(backend)
    const blocked = gate()
    const refreshSpy = vi.spyOn(backend, 'refresh').mockImplementation(async (token) => {
      blocked.entered()
      await blocked.blocked
      return refresh(token)
    })
    const upstream = vi.spyOn(backend, 'request')
    advance(5 * 60_000 + 1)
    const first = a.request('accounts')
    await blocked.started
    const second = a.request('accounts')
    blocked.release()
    expect((await Promise.all([first, second])).map((response) => response.status)).toEqual([
      200, 200,
    ])
    expect(refreshSpy).toHaveBeenCalledTimes(1)
    const rotated = await refreshSpy.mock.results[0]!.value
    expect(upstream.mock.calls.map((call) => call[1])).toEqual([
      `Bearer ${rotated.accessToken}`,
      `Bearer ${rotated.accessToken}`,
    ])
  })

  it('cannot resurrect a logged-out session when refresh finishes late', async () => {
    const { browser, backend, advance } = setup()
    const a = browser()
    await a.login()
    const oldCookie = a.cookie
    const refresh = backend.refresh.bind(backend)
    const revoke = vi.spyOn(backend, 'revoke')
    const blocked = gate()
    let rotatedRefreshToken = ''
    vi.spyOn(backend, 'refresh').mockImplementation(async (token) => {
      const rotated = await refresh(token)
      rotatedRefreshToken = rotated.refreshToken
      blocked.entered()
      await blocked.blocked
      return rotated
    })
    const upstream = vi.spyOn(backend, 'request')
    advance(5 * 60_000 + 1)
    const pending = a.request('accounts')
    await blocked.started
    const logout = a.request('auth/logout', 'POST')
    try {
      await Promise.resolve()
    } finally {
      blocked.release()
    }
    expect((await logout).status).toBe(200)
    expect((await pending).status).toBe(401)
    expect(upstream).not.toHaveBeenCalled()
    expect(revoke).toHaveBeenCalledWith(rotatedRefreshToken)
    expect((await a.request('accounts', 'GET', undefined, { cookie: oldCookie })).status).toBe(401)
  })

  it('blocks banking but retains private revocation state when logout must be retried', async () => {
    const { browser, backend } = setup()
    const a = browser()
    await a.login()
    const revoke = vi
      .spyOn(backend, 'revoke')
      .mockRejectedValueOnce(new Error('Temporary revocation failure'))

    expect((await a.request('auth/logout', 'POST')).status).toBeGreaterThanOrEqual(500)
    expect((await a.request('accounts')).status).toBe(401)
    expect((await a.request('auth/session')).data.customer).toBeNull()
    expect((await a.request('auth/logout', 'POST')).status).toBe(200)
    expect(revoke).toHaveBeenCalledTimes(2)
  })

  it('does not replay a mutation after an uncertain upstream failure', async () => {
    const { browser, backend } = setup()
    const a = browser()
    await a.login()
    const before = (await a.request('accounts')).data.find(
      (item: { id: string }) => item.id === transfer.sourceAccountId,
    ).balanceMinor
    const original = backend.request.bind(backend)
    let committedReceipt: unknown
    const upstream = vi.spyOn(backend, 'request').mockImplementationOnce(async (...args) => {
      committedReceipt = await original(...args)
      throw new Error('Simulated response lost after commit')
    })
    const failed = await a.request('transfers', 'POST', transfer)
    expect(failed.status).toBeGreaterThanOrEqual(500)
    expect(upstream).toHaveBeenCalledTimes(1)
    const replay = await a.request('transfers', 'POST', transfer)
    expect(replay.status).toBe(200)
    expect(committedReceipt).toMatchObject({ status: 'COMPLETED', amountMinor: 1000 })
    expect(replay.data).toEqual(committedReceipt)
    expect(upstream).toHaveBeenCalledTimes(2)
    const after = (await a.request('accounts')).data.find(
      (item: { id: string }) => item.id === transfer.sourceAccountId,
    ).balanceMinor
    expect(after).toBe(before - transfer.amountMinor)
  })
  it('invalidates failed refresh and never dispatches with expired credentials', async () => {
    const { browser, backend, advance } = setup()
    const a = browser()
    await a.login()
    const upstream = vi.spyOn(backend, 'request')
    const refresh = vi.spyOn(backend, 'refresh').mockRejectedValue(new Error('Refresh unavailable'))
    advance(5 * 60_000 + 1)
    expect((await a.request('accounts')).status).toBeGreaterThanOrEqual(500)
    expect(upstream).not.toHaveBeenCalled()
    expect((await a.request('accounts')).status).toBe(401)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect((await a.request('auth/session')).data.customer).toBeNull()
  })

  it('expires idle and absolute sessions and polling does not extend the idle deadline', async () => {
    const { browser, advance } = setup()
    const a = browser()
    await a.login()
    for (let minute = 0; minute < 29; minute++) {
      advance(60_000)
      expect((await a.request('auth/session')).data.customer.id).toBe('customer-taylor')
    }
    advance(60_000)
    expect((await a.request('accounts')).status).toBe(401)
    await a.login()
    for (let interval = 0; interval < 16; interval++) {
      advance(29 * 60_000)
      expect((await a.request('accounts')).status).toBe(200)
    }
    advance(17 * 60_000)
    expect((await a.request('accounts')).status).toBe(401)
  })
  it('keeps login available when anonymous sessions exceed their bounded pool', async () => {
    const { browser } = setup()
    for (let index = 0; index < 520; index++)
      expect((await browser().request('auth/session')).status).toBe(200)

    const legitimate = browser()
    expect((await legitimate.login()).status).toBe(200)
    expect((await legitimate.request('accounts')).status).toBe(200)
  })
  it('blocks a transfer whose session is revoked while hashing before the atomic write', async () => {
    const { browser } = setup()
    const a = browser()
    const otherSession = browser()
    await a.login()
    await otherSession.login()
    const before = (await otherSession.request('accounts')).data
    const blocked = gate()
    const digest = crypto.subtle.digest.bind(crypto.subtle)
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
      blocked.entered()
      await blocked.blocked
      return digest(...args)
    })
    const pending = a.request('transfers', 'POST', transfer)
    try {
      await blocked.started
      expect((await a.request('auth/logout', 'POST')).status).toBe(200)
    } finally {
      blocked.release()
      spy.mockRestore()
    }
    expect((await pending).status).toBe(401)
    expect((await otherSession.request('accounts')).data).toEqual(before)
  })
})
