import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'
import viteConfig from './vitest.vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          test: {
            name: 'domain',
            environment: 'node',
            include: ['src/tests/domain/**/*.test.ts'],
            clearMocks: true,
            restoreMocks: true,
          },
        },
        {
          test: {
            name: 'data',
            environment: 'node',
            include: ['src/tests/data/**/*.test.ts'],
            clearMocks: true,
            restoreMocks: true,
          },
        },
        {
          extends: true,
          test: {
            name: 'ui',
            environment: 'jsdom',
            server: { deps: { inline: ['@nuxt/ui'] } },
            setupFiles: ['./src/tests/setup.ts'],
            include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
            exclude: ['src/tests/domain/**', 'src/tests/data/**'],
            clearMocks: true,
            restoreMocks: true,
          },
        },
      ],
    },
  }),
)
