import { test as base, expect } from '@playwright/test'
import { createTestEnvironment } from '../testing/environment.mjs'

export const test = base.extend({
  environment: [
    async ({ browserName }, use) => {
      if (browserName !== 'chromium') throw new Error('This suite currently targets Chromium.')
      const environment = await createTestEnvironment()
      try {
        const demo = await environment.start({
          NUXT_PUBLIC_ENABLE_MOCKS: 'true',
          NUXT_PUBLIC_ENABLE_BFF: 'false',
        })
        await use({ ...environment, demo: demo.url })
      } finally {
        await environment.close()
      }
    },
    { scope: 'worker', timeout: 60_000 },
  ],
  browserErrors: [
    async ({ page }, use) => {
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (/hydration.*mismatch/i.test(message.text())) errors.push(message.text())
      })
      await use(errors)
      expect(errors, 'Uncaught browser errors or hydration mismatches').toEqual([])
    },
    { auto: true },
  ],
})
export { expect }

// Fetch inside the page so demo requests go through the real Service Worker.
export async function readAccounts(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/accounts')
    if (!response.ok) throw new Error(`Accounts failed: ${response.status}`)
    return response.json()
  })
}
