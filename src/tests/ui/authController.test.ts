import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { AuthSession } from '@/contracts/auth'
import { ApiError } from '@/data/api/apiError'
import { createBankingSession } from '@/data/api/bankingSession'
import { createAuthController } from '@/features/auth/authController'

const customer = (id: string) => ({ id, firstName: id, lastName: 'Test', displayName: id })
const credentials = { email: 'b@example.com', password: 'password' }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function fixture() {
  const ready = ref(true)
  const csrfToken = ref('csrf-a')
  const logoutIntent = ref<string | null | undefined>(null)
  const resolveCustomer = vi.fn(async () => customer('B'))
  const session = createBankingSession({ userId: ref<string | null>('A'), ready, resolveCustomer })
  const api = {
    session: vi.fn(async (): Promise<AuthSession> => ({
      customer: customer('A'),
      csrfToken: 'csrf-a',
    })),
    login: vi.fn(async (): Promise<AuthSession> => ({
      customer: customer('B'),
      csrfToken: 'csrf-b',
    })),
    logout: vi.fn(async (): Promise<AuthSession> => ({ customer: null, csrfToken: 'anonymous' })),
  }
  const announce = vi.fn()
  const navigate = vi.fn(async (path: string) => path)
  const controller = createAuthController({
    api,
    session,
    ready,
    csrfToken,
    logoutIntent,
    announce,
    navigate,
  })
  return {
    ...controller,
    api,
    session,
    ready,
    csrfToken,
    logoutIntent,
    announce,
    navigate,
    resolveCustomer,
  }
}

describe('authentication controller', () => {
  it('clears the old identity before login and clears pending logout only after verified success', async () => {
    const f = fixture()
    f.logoutIntent.value = '1'
    const login = deferred<AuthSession>()
    f.api.login.mockReturnValueOnce(login.promise)
    const result = f.auth.login(credentials)
    expect(f.ready.value).toBe(false)
    expect(f.session.userId.value).toBeNull()
    await vi.waitFor(() => expect(f.api.login).toHaveBeenCalledWith(credentials, 'csrf-a'))
    expect(f.auth.busy.value).toBe(true)
    expect(f.logoutIntent.value).toBe('1')
    expect(await f.auth.login(credentials)).toBe(false)
    login.resolve({ customer: customer('B'), csrfToken: 'csrf-b' })
    expect(await result).toBe(true)
    expect(f.session.userId.value).toBe('B')
    expect(f.csrfToken.value).toBe('csrf-b')
    expect(f.logoutIntent.value).toBeNull()
    expect(f.announce).toHaveBeenCalledOnce()
    expect(f.api.login).toHaveBeenCalledOnce()
    expect(f.auth.busy.value).toBe(false)
  })

  it('keeps banking disabled and reports login failures without clearing pending logout', async () => {
    const f = fixture()
    f.logoutIntent.value = '1'
    f.api.login.mockRejectedValueOnce(
      new ApiError(503, 'SERVICE_UNAVAILABLE', 'Service unavailable'),
    )
    expect(await f.auth.login(credentials)).toBe(false)
    expect(f.auth.error.value).toBe('Service unavailable')
    expect(f.auth.busy.value).toBe(false)
    expect(f.ready.value).toBe(false)
    expect(f.session.userId.value).toBeNull()
    expect(f.logoutIntent.value).toBe('1')
    expect(f.announce).not.toHaveBeenCalled()
    expect(f.resolveCustomer).not.toHaveBeenCalled()
  })

  it('retains unconfirmed logout intent, blocks polling, and supports explicit retry', async () => {
    const f = fixture()
    f.api.logout.mockRejectedValueOnce(new Error('Offline'))
    const first = f.auth.logout()
    expect(f.session.userId.value).toBeNull()
    expect(f.ready.value).toBe(false)
    expect(f.logoutIntent.value).toBe('1')
    await first
    expect(f.auth.error.value).toBe('Sign out could not be confirmed. Please retry.')
    expect(f.auth.busy.value).toBe(false)
    expect(f.navigate).toHaveBeenCalledWith('/login')
    await f.revalidate()
    expect(f.api.session).toHaveBeenCalledTimes(1)
    await f.auth.logout()
    expect(f.logoutIntent.value).toBeNull()
    expect(f.csrfToken.value).toBe('')
    expect(f.auth.error.value).toBe('')
    expect(f.session.status.value).toBe('signed-out')
    expect(f.ready.value).toBe(false)
    expect(f.api.logout).toHaveBeenCalledTimes(2)
  })

  it('ignores a stale revalidation response after a successful credential change', async () => {
    const f = fixture()
    const old = deferred<AuthSession>()
    f.api.session.mockReturnValueOnce(old.promise)
    const check = f.revalidate()
    expect(await f.auth.login(credentials)).toBe(true)
    const generation = f.session.generation.value
    old.resolve({ customer: customer('A'), csrfToken: 'stale-token' })
    await check
    expect(f.session.userId.value).toBe('B')
    expect(f.session.generation.value).toBe(generation)
    expect(f.csrfToken.value).toBe('csrf-b')
    expect(f.ready.value).toBe(true)
    expect(f.navigate).not.toHaveBeenCalled()
  })

  it('coalesces concurrent checks into one follow-up that detects a later sign-out', async () => {
    const f = fixture()
    const first = deferred<AuthSession>()
    f.api.session.mockReturnValueOnce(first.promise)
    f.api.session.mockResolvedValueOnce({ customer: null, csrfToken: 'anonymous' })
    f.resolveCustomer.mockRejectedValueOnce(new ApiError(401, 'SESSION_REQUIRED', 'Sign in'))
    const check = f.revalidate()
    await Promise.all([f.revalidate(), f.revalidate(), f.revalidate()])
    expect(f.api.session).toHaveBeenCalledOnce()
    first.resolve({ customer: customer('A'), csrfToken: 'csrf-a' })
    await check
    await vi.waitFor(() => expect(f.navigate).toHaveBeenCalledWith('/login'))
    expect(f.api.session).toHaveBeenCalledTimes(2)
    expect(f.ready.value).toBe(false)
    expect(f.session.userId.value).toBeNull()
    expect(f.session.status.value).toBe('signed-out')
  })
})
