import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './scripts/storybook',
  workers: 1,
  use: { channel: 'chromium', baseURL: 'http://127.0.0.1:6007' },
  webServer: {
    command: 'npx vite preview --outDir storybook-static --host 127.0.0.1 --port 6007 --strictPort',
    url: 'http://127.0.0.1:6007',
    reuseExistingServer: false,
  },
})
