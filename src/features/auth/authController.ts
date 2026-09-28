import { ref, type Ref } from 'vue'
import type { LoginCredentials } from '@/contracts/auth'
import type { createAuthApi } from '@/data/api/authApi'
import type { BankingSession } from '@/data/api/bankingSession'

/** Login, logout and revalidation share the same serialized identity lifecycle. */
export function createAuthController({
  api: authApi,
  session,
  ready,
  csrfToken,
  logoutIntent,
  announce,
  navigate,
}: {
  api: ReturnType<typeof createAuthApi>
  session: BankingSession
  ready: Ref<boolean>
  csrfToken: Ref<string>
  logoutIntent: Ref<string | null | undefined>
  announce: () => void
  navigate: (path: string) => Promise<unknown>
}) {
  const authBusy = ref(false)
  const authError = ref('')
  async function refreshAuth() {
    const result = await authApi.session()
    csrfToken.value = result.csrfToken
    return result
  }
  const auth = {
    busy: authBusy,
    logoutPending: logoutIntent,
    error: authError,
    async login(credentials: LoginCredentials) {
      if (authBusy.value) return false
      authBusy.value = true
      authError.value = ''
      try {
        await session.changeIdentity(async () => {
          await refreshAuth()
          const result = await authApi.login(credentials, csrfToken.value)
          csrfToken.value = result.csrfToken
        })
        if (session.error.value) throw session.error.value
        if (ready.value) {
          logoutIntent.value = null
          announce()
        } else authError.value = 'Email or password is incorrect.'
        return ready.value
      } catch (error) {
        authError.value =
          error instanceof Error ? error.message : 'Sign in failed. Please try again.'
        return false
      } finally {
        authBusy.value = false
      }
    },
    async logout() {
      if (authBusy.value) return
      authBusy.value = true
      authError.value = ''
      logoutIntent.value = '1'
      announce()
      await session.logout(async () => {
        await refreshAuth()
        await authApi.logout(csrfToken.value)
        csrfToken.value = ''
        logoutIntent.value = null
        announce()
      })
      if (session.error.value) authError.value = 'Sign out could not be confirmed. Please retry.'
      authBusy.value = false
      await navigate('/login')
    },
  }
  let checking = false
  let checkAgain = false
  const revalidate = async () => {
    if (authBusy.value || logoutIntent.value) return
    if (checking) {
      checkAgain = true
      return
    }
    checking = true
    const checkedGeneration = session.generation.value
    try {
      const result = await authApi.session()
      if (authBusy.value || logoutIntent.value || checkedGeneration !== session.generation.value)
        return
      const rotated = !!session.userId.value && csrfToken.value !== result.csrfToken
      csrfToken.value = result.csrfToken
      if (rotated || (result.customer?.id ?? null) !== session.userId.value) {
        await session.changeIdentity()
        await navigate(session.userId.value ? '/' : '/login')
      }
    } catch {
      if (!authBusy.value && checkedGeneration === session.generation.value)
        await session.logout(async () => {})
    } finally {
      checking = false
      if (checkAgain) {
        checkAgain = false
        void revalidate()
      }
    }
  }
  return { auth, revalidate }
}
