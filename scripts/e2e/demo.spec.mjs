import { test, expect, readAccounts } from './fixtures.mjs'

test('demo hydrates, starts MSW and navigates to accounts', async ({ page, environment }) => {
  const response = await page.goto(environment.demo)
  const html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
  expect(html).toContain('Loading banking session')
  expect(html).not.toContain('Everyday Checking')
  await expect(page.getByRole('article', { name: 'Everyday Checking' })).toBeVisible()
  expect(await page.evaluate(() => !!globalThis.navigator.serviceWorker.controller)).toBe(true)
  await page.getByRole('link', { name: 'Accounts', exact: true }).click()
  await expect(page.getByRole('article', { name: 'Everyday Checking' })).toBeVisible()
  await expect(page).toHaveTitle('Accounts · Personal Finance Lab')
  await expect(page.getByRole('article', { name: 'Travel Reserve' })).toContainText('Frozen')
})

test('transaction filters survive reload and Back/Forward', async ({ page, environment }) => {
  await page.goto(`${environment.demo}/transactions`)
  await expect(page.getByRole('button', { name: 'Apply filters' })).toBeEnabled()
  await page.getByLabel('Search transactions').fill('Weekly groceries')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page).toHaveURL(/query=Weekly(?:\+|%20)groceries/)
  await expect(page.getByRole('table')).toContainText('Weekly groceries')
  await expect(page.getByRole('table')).not.toContainText('Morning coffee')
  await page.reload()
  await expect(page.getByLabel('Search transactions')).toHaveValue('Weekly groceries')
  await expect(page.getByRole('table')).toContainText('Weekly groceries')
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page).not.toHaveURL(/query=/)
  await page.goBack()
  await expect(page.getByLabel('Search transactions')).toHaveValue('Weekly groceries')
  await page.goForward()
  await expect(page.getByLabel('Search transactions')).toHaveValue('')
})

test('confirmed transfer persists exact balances and activity; reset restores seed', async ({
  page,
  environment,
}) => {
  await page.goto(`${environment.demo}/transfer`)
  await expect(page.getByRole('combobox', { name: 'From account' })).toBeEnabled()
  const before = await readAccounts(page)
  const posts = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/transfers')
      posts.push(request)
  })
  await page.getByRole('combobox', { name: 'From account' }).click()
  await page.getByRole('option', { name: /Everyday Checking/ }).click()
  await page.getByRole('combobox', { name: 'To account' }).click()
  await page.getByRole('option', { name: /Rainy Day Savings/ }).click()
  await page.getByPlaceholder('0.00').fill('10.29')
  await page.getByLabel('Reference').fill('Browser persistence check')
  await page.getByRole('button', { name: 'Review transfer' }).click()
  await expect(page.getByRole('button', { name: 'Confirm transfer' })).toBeVisible()
  expect(posts).toHaveLength(0)
  await page.getByRole('button', { name: 'Confirm transfer' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Transfer complete' })).toBeVisible()
  expect(posts).toHaveLength(1)
  await page.getByRole('link', { name: 'Back to accounts' }).click()
  await expect(page).toHaveURL(`${environment.demo}/accounts`)
  await expect(page.getByRole('article', { name: 'Everyday Checking' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('article', { name: 'Everyday Checking' })).toBeVisible()
  const after = await readAccounts(page)
  for (const account of before) {
    const delta =
      account.id === 'account-checking' ? -1029 : account.id === 'account-savings' ? 1029 : 0
    expect(after.find((item) => item.id === account.id).balanceMinor).toBe(
      account.balanceMinor + delta,
    )
  }
  await page.getByRole('link', { name: 'Transactions', exact: true }).click()
  await page.getByLabel('Search transactions').fill('Browser persistence check')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(
    page.getByRole('table').getByRole('row').filter({ hasText: 'Browser persistence check' }),
  ).toHaveCount(2)
  await expect(page.getByRole('table')).toContainText('Browser persistence check')
  await page.getByRole('link', { name: 'Accounts', exact: true }).click()
  await page.getByRole('button', { name: 'Reset demo data' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Reset demo', exact: true }).click()
  await expect(page.getByText('Demo data restored.')).toBeVisible()
  expect(await readAccounts(page)).toEqual(before)
  await page.reload()
  await expect(page.getByRole('article', { name: 'Everyday Checking' })).toBeVisible()
  expect(await readAccounts(page)).toEqual(before)
})
