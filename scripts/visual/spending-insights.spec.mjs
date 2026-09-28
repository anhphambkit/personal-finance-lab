import { test, expect } from '../e2e/fixtures.mjs'

for (const width of [1440, 768, 390]) {
  for (const theme of ['light', 'dark']) {
    test(`${theme} spending insights at ${width}px`, async ({ page, environment }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.addInitScript(
        (value) => globalThis.localStorage.setItem('nuxt-color-mode', value),
        theme,
      )
      await page.goto(`${environment.demo}/spending-insights?month=2026-08`)
      await expect(page.locator('html')).toHaveClass(new RegExp(theme))
      await expect(page.getByRole('region', { name: 'Spending summary' })).toContainText('$372.49')
      await expect.soft(page).toHaveScreenshot(`${theme}-spending-insights-${width}.png`)
      await page.locator('main').evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
      await expect(page.getByRole('heading', { name: 'Where your money went' })).toBeVisible()
      expect(
        await page
          .locator('main')
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true)
      await expect.soft(page).toHaveScreenshot(`${theme}-spending-insights-details-${width}.png`)
    })
  }
}
