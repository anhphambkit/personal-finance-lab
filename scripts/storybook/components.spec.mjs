import { test, expect } from '@playwright/test'
const stories = [
  'spendingdashboard--populated',
  'spendingdashboard--empty',
  'spendingdashboard--no-prior-spending',
  'spendingdashboard--large-amounts',
  'spendingdashboard--customized',
  'accountcard--active',
  'accountcard--frozen',
  'moneydisplay--default',
  'moneyinput--default',
  'moneyinput--invalid',
  'transactiontable--default',
  'transferdetailsform--default',
  'transferdetailsform--saved-recipient',
  'transferdetailsform--no-saved-recipients',
  'transferreview--default',
  'transferreview--confirming',
  'transferreview--uncertain',
  'transferreview--conflict',
  'transferreceipt--default',
]
for (const theme of ['light', 'dark']) {
  test(`all component stories render in ${theme}`, async ({ page }) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    for (const story of stories) {
      await page.goto(`/iframe.html?id=banking-${story}&viewMode=story&globals=theme:${theme}`)
      await expect(page.locator('#storybook-root')).not.toBeEmpty()
      await expect(page.locator('#storybook-root')).toBeVisible()
      await expect(page.locator('.sb-errordisplay')).not.toBeVisible()
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^((?!dark).)*$/)
    }
    expect(errors).toEqual([])
  })
}

test('eight component groups are indexed and Controls update the rendered amount', async ({
  page,
  request,
}) => {
  const index = await (await request.get('/index.json')).json()
  expect(
    new Set(
      Object.values(index.entries)
        .filter((entry) => entry.type === 'story')
        .map((entry) => entry.title),
    ).size,
  ).toBe(8)
  await page.goto('/?path=/story/banking-moneydisplay--default')
  await page.getByRole('tab', { name: /Controls/ }).click()
  await page.locator('#control-amountMinor').fill('250075')
  await page.locator('#control-amountMinor').press('Tab')
  await expect(
    page.frameLocator('#storybook-preview-iframe').locator('#storybook-root'),
  ).toContainText('$2,500.75')
})

test('every story exposes Controls in the manager', async ({ page }) => {
  for (const story of stories) {
    await page.goto(`/?path=/story/banking-${story}`)
    await page.getByRole('tab', { name: /Controls/ }).click()
    const controls = page.getByRole('tabpanel', { name: /Controls/ })
    await expect(controls.getByRole('row').nth(1)).toBeVisible()
    await expect(controls.getByText('This story has no controls', { exact: true })).toHaveCount(0)
  }
})

test('legacy Uncertain Outcome link redirects and pending Control updates the review', async ({
  page,
}) => {
  await page.goto('/?path=/story/banking-components--uncertain-outcome')
  await expect(page).toHaveURL(/banking-transferreview--uncertain/)
  await page.getByRole('tab', { name: /Controls/ }).click()
  const preview = page.frameLocator('#storybook-preview-iframe')
  await expect(preview.getByRole('button', { name: 'Retry same transfer' })).toBeEnabled()
  const pending = page.getByRole('switch', { name: 'pending' })
  await pending.focus()
  await pending.press('Space')
  await expect(pending).toBeChecked()
  await expect(preview.getByRole('button', { name: 'Retry same transfer' })).toBeDisabled()
  await expect(preview.getByRole('status')).toContainText('Confirming your transfer')
})

test('spending dashboard keeps large exact amounts and charts within mobile width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.goto(
    '/iframe.html?id=banking-spendingdashboard--large-amounts&viewMode=story&globals=theme:dark',
  )
  await expect(page.getByRole('region', { name: 'Spending summary' })).toContainText(
    '$270,215,977,642,229.73',
  )
  expect(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
    ),
  ).toBe(true)
  await expect(
    page.getByRole('list', { name: 'Monthly spending amounts' }).getByRole('listitem'),
  ).toHaveCount(6)
  await page.screenshot({ path: '/private/tmp/bank-insights-large-mobile.png', fullPage: true })
})
