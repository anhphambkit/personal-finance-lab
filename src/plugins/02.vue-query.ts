import { BANKING_CHANGE_KEY, BANKING_RESET_EVENT } from '@/data/sync/bankingChanges'
import { bankingQueryKeys } from '@/data/api/bankingQueryKeys'
import { defineNuxtPlugin, useState } from '#app'
import {
  dehydrate,
  hydrate,
  QueryClient,
  VueQueryPlugin,
  type DehydratedState,
} from '@tanstack/vue-query'

export default defineNuxtPlugin((nuxtApp) => {
  const state = useState<DehydratedState | null>('banking-query', () => null)
  // Never share server state between SSR requests/users.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retryOnMount: false, retry: import.meta.server ? false : 1 },
      mutations: { retry: false },
    },
  })
  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient })
  if (import.meta.server) {
    nuxtApp.hook('app:rendered', () => {
      state.value = dehydrate(queryClient, {
        shouldDehydrateQuery: (query) => query.state.status !== 'pending',
      })
      queryClient.clear()
    })
  } else {
    if (state.value) hydrate(queryClient, state.value)
    const changed = async (event: StorageEvent) => {
      if (event.key !== BANKING_CHANGE_KEY || !event.newValue) return
      try {
        if (JSON.parse(event.newValue).reset) window.dispatchEvent(new Event(BANKING_RESET_EVENT))
      } catch {
        return
      }
      await queryClient.cancelQueries({ queryKey: bankingQueryKeys.all })
      await queryClient.invalidateQueries({ queryKey: bankingQueryKeys.all })
    }
    window.addEventListener('storage', changed)
    nuxtApp.vueApp.onUnmount(() => window.removeEventListener('storage', changed))
  }
})
