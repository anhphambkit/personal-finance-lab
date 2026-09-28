import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-06',
  srcDir: 'src/',
  ssr: true,
  modules: ['@nuxt/ui'],
  css: ['~/shared/styles/main.css'],
  devtools: { enabled: true },
  ui: { fonts: false },
  colorMode: { preference: 'light', fallback: 'light', classSuffix: '' },
  icon: { clientBundle: { scan: true } },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Personal Finance Lab',
      meta: [
        { name: 'description', content: 'A personal banking dashboard with fictional demo data.' },
      ],
    },
  },
  runtimeConfig: {
    bffApiBaseUrl: '',
    authOrigin: '',
    public: { enableMocks: 'true', enableBff: 'false' },
  },
  routeRules: { '/**': { headers: { 'cache-control': 'private, no-store' } } },
  typescript: {
    strict: true,
    tsConfig: {
      compilerOptions: {
        noUncheckedIndexedAccess: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
      },
    },
  },
})
