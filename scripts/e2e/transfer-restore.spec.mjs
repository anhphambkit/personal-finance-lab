import { test, expect } from './fixtures.mjs'

test('draft survives in-app navigation with a warm cache', async ({ page, environment }) => {
  await page.goto(`${environment.demo}/transfer`)
  await page.getByRole('combobox', { name: 'From account' }).click()
  await page.getByRole('option', { name: /Everyday Checking/ }).click()
  await page.getByPlaceholder('0.00').fill('7.25')
  await page.getByRole('link', { name: 'Accounts' }).first().click()
  await expect(page).toHaveURL(/accounts/)
  await page.getByRole('link', { name: 'Transfer' }).first().click()
  await expect(page).toHaveURL(/transfer/)
  await expect(page.getByPlaceholder('0.00')).toHaveValue('7.25')
})
