import { fileURLToPath, URL } from 'node:url'
import ui from '@nuxt/ui/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    ui({
      autoImport: false,
      components: false,
      colorMode: false,
      ui: {
        colors: {
          primary: 'indigo',
          neutral: 'slate',
          success: 'emerald',
          warning: 'amber',
          error: 'rose',
        },
      },
      icon: { clientBundle: { scan: true } },
    }),
  ],
  resolve: {
    alias: {
      // Use Nuxt UI's Vue icon adapter in the standalone Vite test environment.
      '@nuxt/ui/components/Icon.vue': fileURLToPath(
        new URL('./node_modules/@nuxt/ui/dist/runtime/vue/components/Icon.vue', import.meta.url),
      ),
      '#app': fileURLToPath(new URL('./src/tests/nuxtAppStub.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
