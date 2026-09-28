import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineEventHandler, toWebHandler } from 'h3'
import { createBffHandler } from '../../../server/utils/bffHandler'
import { createBffHttpBackend } from '../../../server/utils/bffHttpBackend'

afterEach(() => vi.unstubAllGlobals())

describe('HTTP BFF backend adapter', () => {
  it('keeps backend tokens server-side and forwards only its Bearer authorization', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input)
      calls.push({ url, init })
      if (url.endsWith('/auth/login'))
        return Response.json({
          accessToken: 'a'.repeat(64),
          refreshToken: 'b'.repeat(64),
          expiresAt: Date.now() + 60_000,
          customerId: 'customer-taylor',
        })
      if (url.endsWith('/auth/logout')) return new Response(null, { status: 204 })
      if (url.endsWith('/customer'))
        return Response.json({
          id: 'customer-taylor',
          firstName: 'Taylor',
          lastName: 'Morgan',
          displayName: 'Taylor from the banking service',
        })
      if (url.endsWith('/accounts'))
        return Response.json([
          {
            id: 'account-checking',
            ownerId: 'customer-taylor',
            displayName: 'Everyday Checking',
            type: 'CHECKING',
            accountNumber: '100000004821',
            currency: 'USD',
            balanceMinor: 100,
            status: 'ACTIVE',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ])
      return Response.json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, { status: 404 })
    })
    const handler = createBffHandler({
      backend: createBffHttpBackend('http://127.0.0.1:4000/v1'),
    })
    const handle = toWebHandler(createApp().use(defineEventHandler(handler)))
    let cookie = '',
      csrf = '',
      customer = ''
    async function request(path: string, method = 'GET', body?: unknown) {
      const response = await handle(
        new Request(`http://localhost/api/${path}`, {
          method,
          headers: {
            cookie,
            origin: 'http://localhost',
            'content-type': 'application/json',
            'x-csrf-token': csrf,
            'x-banking-user': customer,
            authorization: 'Bearer browser-forgery',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      )
      const next = response.headers.get('set-cookie')
      if (next) cookie = next.split(';')[0]!
      const data = response.status === 204 ? undefined : await response.json()
      if (data?.csrfToken) {
        csrf = data.csrfToken
        customer = data.customer?.id ?? ''
      }
      return { response, data }
    }
    await request('auth/session')
    const login = await request('auth/login', 'POST', {
      email: 'taylor@example.com',
      password: 'TestBank!2026',
    })
    expect(JSON.stringify(login.data)).not.toMatch(/accessToken|refreshToken|Bearer/)
    expect(login.data.customer.displayName).toBe('Taylor from the banking service')
    const accounts = await request('accounts')
    expect(accounts.response.status).toBe(200)
    expect(accounts.data[0].id).toBe('account-checking')
    const forwarded = calls.find((call) => call.url.endsWith('/accounts'))!
    expect(forwarded.init.headers).toMatchObject({ Authorization: `Bearer ${'a'.repeat(64)}` })
    expect(JSON.stringify(forwarded.init.headers)).not.toMatch(
      /cookie|csrf|banking-user|browser-forgery/i,
    )
    expect(calls.some((call) => call.url === 'http://127.0.0.1:4000/v1/auth/login')).toBe(true)
    expect((await request('auth/logout', 'POST')).response.status).toBe(200)
    expect(calls.some((call) => call.url.endsWith('/auth/logout'))).toBe(true)
    expect(calls.every((call) => call.init.redirect === 'error')).toBe(true)
  })

  it('rejects unsafe upstream locations and malformed token responses', async () => {
    expect(() => createBffHttpBackend('http://bank.example/v1')).toThrow('requires HTTPS')
    expect(() => createBffHttpBackend('https://bank.example/v1?target=other')).toThrow(
      'without query or hash',
    )
    vi.stubGlobal('fetch', async () => Response.json({ accessToken: 'unverified' }))
    await expect(
      createBffHttpBackend('https://bank.example/v1').login('taylor@example.com', 'secret'),
    ).rejects.toMatchObject({ status: 502, code: 'INVALID_RESPONSE' })
  })

  it('rechecks the BFF session after reading a mutation body', async () => {
    const upstream = vi.fn(async () => Response.json({ id: 'transfer-1' }, { status: 201 }))
    vi.stubGlobal('fetch', upstream)
    const backend = createBffHttpBackend('http://127.0.0.1:4000/v1')
    let checks = 0
    const handle = toWebHandler(
      createApp().use(
        defineEventHandler((event) =>
          backend.request(event, 'Bearer trusted', () => {
            checks++
            if (checks === 2) throw new Error('session invalidated while reading')
          }),
        ),
      ),
    )
    const response = await handle(
      new Request('http://localhost/api/transfers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountMinor: 100 }),
      }),
    )

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(checks).toBe(2)
    expect(upstream).not.toHaveBeenCalled()
  })
})
