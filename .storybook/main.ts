import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import type { StorybookConfig } from '@storybook/vue3-vite'
import ui from '@nuxt/ui/vite'
const config: StorybookConfig = {
  stories: ['../stories/**/*.stories.ts'],
  framework: { name: '@storybook/vue3-vite', options: { docgen: false } },
  staticDirs: ['../public'],
  core: { disableTelemetry: true },
  async viteFinal(config) {
    const { mergeConfig } = await import('vite')
    return mergeConfig(config, {
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
          '@': fileURLToPath(new URL('../src', import.meta.url)),
          '#app': fileURLToPath(new URL('./router.ts', import.meta.url)),
          '@nuxt/ui/components/Icon.vue': fileURLToPath(
            new URL(
              '../node_modules/@nuxt/ui/dist/runtime/vue/components/Icon.vue',
              import.meta.url,
            ),
          ),
        },
      },
    })
  },
}
export default config
