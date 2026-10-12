import { BANKING_CHANGE_KEY, BANKING_RESET_EVENT } from '@/data/sync/bankingChanges'
import { refetchBankingData } from '@/data/api/bankingQueryKeys'
import { defineNuxtPlugin } from '#app'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

export default defineNuxtPlugin((nuxtApp) => {
  // Demo data lives in the browser, so queries only run on the client (see `ready`).
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retryOnMount: false, retry: 1 },
      mutations: { retry: false },
    },
  })
  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient })
  if (import.meta.server) return

  // Another tab committed a change: refetch everything.
  const changed = async (event: StorageEvent) => {
    if (event.key !== BANKING_CHANGE_KEY || !event.newValue) return
    try {
      if (JSON.parse(event.newValue).reset) window.dispatchEvent(new Event(BANKING_RESET_EVENT))
    } catch {
      return
    }
    await refetchBankingData(queryClient)
  }
  window.addEventListener('storage', changed)
  nuxtApp.vueApp.onUnmount(() => window.removeEventListener('storage', changed))
})
