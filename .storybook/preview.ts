import { createBankingSession } from '../src/data/api/bankingSession'
import { setup, type Preview } from '@storybook/vue3-vite'
import { createMemoryHistory, createRouter } from 'vue-router'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { ref } from 'vue'
import ui from '@nuxt/ui/vue-plugin'
import UApp from '@nuxt/ui/components/App.vue'
import { bankingContextKey } from '../src/data/api/bankingContext'
import { createBankingApi } from '../src/data/api/bankingApi'
import '../src/shared/styles/main.css'
setup((app) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  app.use(router).use(ui).use(VueQueryPlugin, { queryClient: new QueryClient() })
  app.provide(bankingContextKey, {
    api: createBankingApi(),
    ready: ref(true),
    mocksEnabled: true,
    session: createBankingSession({
      userId: ref('customer-taylor'),
      ready: ref(true),
      resolveCustomer: () => createBankingApi().customer(),
    }),
  })
})
const preview: Preview = {
  loaders: [
    async () => {
      const { worker } = await import('../src/data/mock/browser')
      await worker.start({ quiet: true, onUnhandledRequest: 'bypass' })
      return {}
    },
  ],
  globalTypes: {
    theme: {
      description: 'Banking theme',
      toolbar: { icon: 'paintbrush', items: ['light', 'dark'] },
    },
  },
  initialGlobals: { theme: 'light' },
  decorators: [
    (story, context) => {
      document.documentElement.classList.toggle('dark', context.globals.theme === 'dark')
      return {
        components: { story, UApp },
        template:
          '<UApp><div class="min-h-screen bg-[var(--bank-canvas)] p-6 text-default"><div class="mx-auto max-w-4xl"><story /></div></div></UApp>',
      }
    },
  ],
  parameters: { layout: 'fullscreen' },
}
export default preview
