import { test, expect } from '../e2e/fixtures.mjs'
for (const width of [1440, 390]) {
  for (const theme of ['light', 'dark']) {
    test(`${theme} banking screens at ${width}px`, async ({ page, environment }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.addInitScript(
        (theme) => globalThis.localStorage.setItem('nuxt-color-mode', theme),
        theme,
      )
      for (const route of ['accounts', 'transactions', 'transfer']) {
        await page.goto(`${environment.demo}/${route}`)
        await expect(page.locator('html')).toHaveClass(new RegExp(theme))
        if (route === 'accounts')
          await expect(page.getByRole('article', { name: 'Everyday Checking' })).toBeVisible()
        if (route === 'transactions')
          await expect(
            page.getByRole('status').filter({ hasText: '100 transactions' }),
          ).toBeVisible()
        if (route === 'transfer')
          await expect(page.getByRole('combobox', { name: 'From account' })).toBeEnabled()
        await expect(page).toHaveScreenshot(`${theme}-${route}-${width}.png`, { fullPage: true })
      }
    })
  }
}
