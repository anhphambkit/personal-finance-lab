import { ref } from 'vue'
import { defineNuxtPlugin } from '#app'
import { createBankingApi } from '@/data/api/bankingApi'
import { bankingContextKey } from '@/data/api/bankingContext'

export default defineNuxtPlugin((nuxtApp) => {
  // The initial client render must match the server's demo loading state.
  const ready = ref(false)

  nuxtApp.vueApp.provide(bankingContextKey, {
    api: createBankingApi(),
    ready,
  })

  if (import.meta.client) {
    nuxtApp.hook('app:mounted', async () => {
      try {
        const { worker } = await import('@/data/mock/browser')
        await worker.start({
          serviceWorker: { url: '/mockServiceWorker.js' },
          onUnhandledRequest(request, print) {
            const { pathname } = new URL(request.url)
            // Nuxt may load new icons on demand during development; these are UI assets.
            if (pathname.startsWith('/api/_nuxt_icon/')) return
            if (pathname.startsWith('/api/')) print.error()
          },
        })
      } catch (error) {
        console.error('Demo services could not start.', error)
      } finally {
        // Let queries surface their normal network error if the worker could not start.
        ready.value = true
      }
    })
  }
})
