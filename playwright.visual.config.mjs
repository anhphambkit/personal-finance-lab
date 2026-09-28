import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './scripts/visual',
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { animations: 'disabled', maxDiffPixelRatio: 0.001 },
  },
  snapshotPathTemplate: '{testDir}/baselines/{platform}/{arg}{ext}',
  use: {
    channel: 'chromium',
    serviceWorkers: 'allow',
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    reducedMotion: 'reduce',
  },
})
