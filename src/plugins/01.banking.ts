import { navigateTo, refreshCookie, useCookie } from '#app'
import { ref } from 'vue'
import { defineNuxtPlugin, useRequestFetch, useRuntimeConfig, useState } from '#app'
import { readEnv } from '@/app/config/env'
import { createRequestBankingFetch } from '@/app/requestBankingFetch'
import { createAuthApi } from '@/data/api/authApi'
import { createBankingApi, type BankingFetch } from '@/data/api/bankingApi'
import { bankingContextKey } from '@/data/api/bankingContext'
import { createBankingSession } from '@/data/api/bankingSession'
import { createSessionBankingApi } from '@/data/api/sessionBankingApi'
import { BANKING_CHANGE_KEY } from '@/data/sync/bankingChanges'
import { createAuthController } from '@/features/auth/authController'
import { createSessionRecovery } from '@/features/transfers/sessionRecovery'
import { clearRecoveryForIdentity } from '@/features/transfers/transferRecovery'

export default defineNuxtPlugin(async (nuxtApp) => {
  const config = useRuntimeConfig()
  const { mocksEnabled } = readEnv(config.public)
  const bffEnabled = !mocksEnabled && String(config.public.enableBff) === 'true'
  // MSW starts after hydration; the external BFF can resolve identity during SSR.
  const ready = ref(!mocksEnabled)
  const csrfToken = ref('')
  const userId = useState<string | null>('banking-user', () => null)
  const requestFetch = useRequestFetch()
  const fetcher: BankingFetch = import.meta.server
    ? createRequestBankingFetch(requestFetch)
    : (url, init) => fetch(url, { ...init, credentials: 'same-origin' })

  const recovery: { current?: ReturnType<typeof createSessionRecovery> } = {}
  const api = createBankingApi('/api/', async (url, init) => {
    const owner = userId.value
    const response = await fetcher(url, {
      ...init,
      headers: {
        ...init.headers,
        ...(bffEnabled && userId.value ? { 'X-Banking-User': userId.value } : {}),
        ...(bffEnabled && csrfToken.value ? { 'X-CSRF-Token': csrfToken.value } : {}),
      },
    })
    if (
      import.meta.client &&
      bffEnabled &&
      response.ok &&
      init.method === 'POST' &&
      owner === userId.value
    ) {
      try {
        localStorage.setItem(
          BANKING_CHANGE_KEY,
          JSON.stringify({ owner, token: crypto.randomUUID() }),
        )
      } catch {
        /* Optional cross-tab refresh. */
      }
    }
    return response
  })
  const generation = useState<number>('banking-session-generation', () => 0)
  const sessionError = useState<unknown>('banking-session-error', () => undefined)
  const session = createBankingSession({
    userId,
    generation,
    ready,
    resolveCustomer: async (signal) => {
      const customer = await api.customer(signal)
      if (import.meta.client && bffEnabled) await recovery.current?.load(customer.id, signal)
      return customer
    },
    cleanupRecovery: (owner) => {
      if (import.meta.client && mocksEnabled) clearRecoveryForIdentity(owner, true)
    },
  })
  const guardedApi = createSessionBankingApi(
    api,
    session,
    () => recovery.current?.flush(),
    () => ready.value,
  )
  const context = { api: guardedApi, ready, mocksEnabled, session }
  nuxtApp.vueApp.provide(bankingContextKey, context)

  if (mocksEnabled) {
    const busy = ref(false)
    const mockAuth = {
      busy,
      logoutPending: ref<string | null>(null),
      error: ref(''),
      async login() {
        return true
      },
      async logout() {},
    }
    if (import.meta.client) {
      nuxtApp.hook('app:mounted', async () => {
        try {
          const { worker } = await import('@/data/mock/browser')
          await worker.start({
            serviceWorker: { url: '/mockServiceWorker.js' },
            onUnhandledRequest(request, print) {
              const { pathname } = new URL(request.url)
              if (pathname.startsWith('/api/_nuxt_icon/')) return
              if (pathname.startsWith('/api/')) print.error()
            },
          })
        } catch (error) {
          console.error('Mock services could not start.', error)
        } finally {
          await session.changeIdentity()
        }
      })
    }
    return { provide: { banking: context, bankingSessionError: sessionError, auth: mockAuth } }
  }

  const logoutIntent = useCookie<string | null>('bank-signout-pending', {
    sameSite: 'lax',
    path: '/',
  })
  const authApi = createAuthApi(fetcher)
  recovery.current = createSessionRecovery({
    fetcher,
    authApi,
    session,
    csrfToken,
    mocksEnabled: false,
  })
  session.onClear(recovery.current.clear)
  if (import.meta.server) {
    if (logoutIntent.value) await session.logout(async () => {})
    else await session.changeIdentity()
    sessionError.value = session.error.value
  } else {
    ready.value = !!userId.value
    if (bffEnabled && userId.value) {
      try {
        await recovery.current.load(userId.value)
      } catch {
        await session.logout(async () => {})
      }
    }
  }
  const announce = () => {
    try {
      localStorage.setItem('bank-auth-change', crypto.randomUUID())
    } catch {
      /* Focus revalidation remains available. */
    }
  }
  const { auth, revalidate } = createAuthController({
    api: authApi,
    session,
    ready,
    csrfToken,
    logoutIntent,
    announce,
    navigate: async (path) => navigateTo(path),
  })
  if (import.meta.client && bffEnabled) {
    const changed = (event: StorageEvent) => {
      if (event.key === 'bank-auth-change') {
        refreshCookie('bank-signout-pending')
        void session.logout(async () => {}).then(revalidate)
      }
    }
    window.addEventListener('storage', changed)
    window.addEventListener('focus', revalidate)
    const timer = window.setInterval(revalidate, 30_000)
    nuxtApp.hook('app:mounted', revalidate)
    nuxtApp.vueApp.onUnmount(() => {
      window.removeEventListener('storage', changed)
      window.removeEventListener('focus', revalidate)
      window.clearInterval(timer)
    })
  }
  return { provide: { banking: context, bankingSessionError: sessionError, auth } }
})
