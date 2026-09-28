import { test, expect } from './fixtures.mjs'

for (const width of [1440, 768, 390]) {
  test(`spending insights filters and exact demo spending at ${width}px`, async ({
    page,
    environment,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`${environment.demo}/spending-insights?month=2026-08`)
    await expect(
      page.getByRole('heading', { name: 'Spending insights', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible()
    const expected = await page.evaluate(async () => {
      const response = await fetch(
        '/api/transactions?direction=DEBIT&status=COMPLETED&dateFrom=2026-08-01&dateTo=2026-08-31&pageSize=100',
      )
      const { data } = await response.json()
      const minor = data
        .filter((entry) => ['CARD', 'CASH', 'FEE'].includes(entry.type))
        .reduce((sum, entry) => sum + entry.amountMinor, 0)
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
        minor / 100,
      )
    })
    await expect(page.getByRole('region', { name: 'Spending summary' })).toContainText(expected)
    expect(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
      ),
    ).toBe(true)
    await page.getByLabel('Month (UTC)', { exact: true }).fill('2026-07')
    await page.getByRole('button', { name: 'Apply filters' }).click()
    await expect(page).toHaveURL(/month=2026-07/)
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Month (UTC)', { exact: true })).toHaveValue('2026-07')
    await page.goBack()
    await expect(page.getByLabel('Month (UTC)', { exact: true })).toHaveValue('2026-08')
    await page.getByRole('combobox', { name: 'Account', exact: true }).click()
    await page.getByRole('option', { name: 'Rainy Day Savings', exact: true }).click()
    await page.getByRole('button', { name: 'Apply filters' }).click()
    await expect(page).toHaveURL(/accountId=account-savings/)
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Spending summary' })).toContainText(
      'No spending this month',
    )
    await page.screenshot({ path: `test-results/spending-insights-${width}.png`, fullPage: true })
  })
}

test('invalid insights link is recoverable without requesting transactions', async ({
  page,
  environment,
}) => {
  const requests = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/transactions') requests.push(request.url())
  })
  await page.goto(`${environment.demo}/spending-insights?month=2026-13&month=2026-08`)
  await expect(page.getByRole('heading', { name: 'Check the filters in this link' })).toBeVisible()
  expect(requests).toEqual([])
  await page.getByRole('button', { name: 'Clear invalid filters' }).click()
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible()
})
