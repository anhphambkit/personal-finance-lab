import { test, expect, readAccounts } from './fixtures.mjs'
async function fillTransfer(page) {
  await page.getByRole('combobox', { name: 'From account' }).click()
  await page.getByRole('option', { name: /Everyday Checking/ }).click()
  await page.getByRole('combobox', { name: 'To account' }).click()
  await page.getByRole('option', { name: /Rainy Day Savings/ }).click()
  await page.getByPlaceholder('0.00').fill('10.50')
  await page.getByLabel('Reference').fill('Recovered browser transfer')
}
test('dark mode persists and can be changed with the keyboard', async ({ page, environment }) => {
  await page.goto(environment.demo)
  await expect(page.getByRole('article', { name: 'Everyday Checking' })).toBeVisible()
  await page.getByRole('button', { name: /Switch to dark mode/i }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: /Switch to light mode/i }).click()
  await expect(page.locator('html')).toHaveClass(/light/)
})
test('new recipient is saved, selected, transferred to and retained after reload', async ({
  page,
  environment,
}) => {
  await page.goto(`${environment.demo}/transfer`)
  await page.getByRole('combobox', { name: 'From account' }).click()
  await page.getByRole('option', { name: /Everyday Checking/ }).click()
  await page.getByRole('radio', { name: 'Someone else' }).click()
  await page.getByRole('radio', { name: 'Other bank' }).click()
  await page.getByRole('combobox', { name: /^Bank/ }).click()
  await page.getByRole('option', { name: 'Techcombank', exact: true }).click()
  await page.getByRole('textbox', { name: /^Account number/ }).fill('987654321012')
  await page.getByRole('textbox', { name: /^Account holder name/ }).fill('New Browser Recipient')
  await page.getByRole('checkbox', { name: 'Save recipient for next time' }).check()
  await page.getByPlaceholder('0.00').fill('10.50')
  await page.getByRole('button', { name: 'Review transfer' }).click()
  await expect(page.getByRole('heading', { name: 'Review your transfer' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('987654321012')
  await page.getByRole('button', { name: 'Confirm transfer' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Transfer complete' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'From account' })).toBeEnabled()
  const beneficiaries = await page.evaluate(async () => (await fetch('/api/beneficiaries')).json())
  expect(beneficiaries.some((b) => b.displayName === 'New Browser Recipient')).toBe(true)
  await page.getByRole('combobox', { name: 'From account' }).click()
  await page.getByRole('option', { name: /Everyday Checking/ }).click()
  await page.getByRole('radio', { name: 'Someone else' }).click()
  await page.getByRole('radio', { name: 'Other bank' }).click()
  await page.getByRole('button', { name: 'Saved recipient', exact: true }).click()
  await page.getByPlaceholder('Search name, bank or last 4 digits').fill('New Browser')
  await page.getByRole('option', { name: /New Browser Recipient/ }).click()
  await expect(page.getByPlaceholder('Search name, bank or last 4 digits')).not.toBeVisible()
  await page.getByPlaceholder('0.00').fill('1.25')
  await expect(page.getByPlaceholder('0.00')).toHaveValue('1.25')
  await page.getByRole('button', { name: 'Review transfer' }).click()
  await expect(page.getByRole('heading', { name: 'Review your transfer' })).toBeVisible()
  await expect(page.getByText('New Browser Recipient', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Confirm transfer' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Transfer complete' })).toBeVisible()
  const after = await page.evaluate(async () => (await fetch('/api/beneficiaries')).json())
  expect(after).toHaveLength(beneficiaries.length)
})

test('one-time recipient is not saved, even after reload', async ({ page, environment }) => {
  await page.goto(`${environment.demo}/transfer`)
  await page.getByRole('combobox', { name: 'From account' }).click()
  await page.getByRole('option', { name: /Everyday Checking/ }).click()
  await page.getByRole('radio', { name: 'Someone else' }).click()
  await page.getByRole('radio', { name: 'Other bank' }).click()
  await page.getByRole('combobox', { name: /^Bank/ }).click()
  await page.getByRole('option', { name: 'Techcombank', exact: true }).click()
  await page.getByRole('textbox', { name: /^Account number/ }).fill('912345678901')
  await page.getByRole('textbox', { name: /^Account holder name/ }).fill('One-time Recipient')
  await expect(
    page.getByRole('checkbox', { name: 'Save recipient for next time' }),
  ).not.toBeChecked()
  await page.getByPlaceholder('0.00').fill('1.25')
  await expect(page.getByPlaceholder('0.00')).toHaveValue('1.25')
  await page.getByRole('button', { name: 'Review transfer' }).click()
  await expect(page.getByText('This recipient will not be saved.')).toBeVisible()
  await page.getByRole('button', { name: 'Confirm transfer' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Transfer complete' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'From account' })).toBeEnabled()
  const recipients = await page.evaluate(async () => (await fetch('/api/beneficiaries')).json())
  expect(recipients.some((item) => item.accountNumber === '912345678901')).toBe(false)
})

for (const width of [1440, 390]) {
  test(`saved recipients support search, keyboard selection and draft restoration at ${width}px`, async ({
    page,
    environment,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${environment.demo}/transfer`)
    await page.getByRole('combobox', { name: 'From account' }).click()
    await page.getByRole('option', { name: /Everyday Checking/ }).click()
    await page.getByRole('radio', { name: 'Someone else' }).click()
    await expect(page.getByRole('textbox', { name: /^Account number/ })).toHaveValue('200000008319')
    await page.getByRole('button', { name: 'Check account' }).click()
    await expect(page.getByText('Verified Raksul-bank account')).toBeVisible()
    await page.getByRole('radio', { name: 'Other bank' }).click()
    await expect(page.getByRole('textbox', { name: /^Account number/ })).toHaveValue('987654327451')
    await expect(page.getByRole('textbox', { name: /^Account holder name/ })).toHaveValue(
      'Avery Stone',
    )
    await expect(page.getByRole('combobox', { name: /^Bank/ })).toContainText('Techcombank')
    await expect(page.getByText('This recipient is already saved.')).not.toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Save recipient for next time' })).toBeVisible()
    await page.getByRole('button', { name: 'Saved recipient', exact: true }).click()
    const search = page.getByPlaceholder('Search name, bank or last 4 digits')
    await search.fill('no-such-contact')
    await expect(page.getByText('No saved recipients match your search.')).toBeVisible()
    await search.fill('Raksul-bank')
    await expect(page.getByRole('option')).toHaveCount(0)
    await search.fill('Harbor Bank')
    await expect(page.getByRole('option')).toHaveCount(2)
    await page.getByRole('option', { name: /Maple Apartments/ }).click()
    await expect(search).not.toBeVisible()
    await page.getByRole('radio', { name: 'Same bank' }).click()
    await expect(
      page.getByRole('button', { name: 'Saved recipient', exact: true }),
    ).not.toContainText('Maple Apartments')
    await page.getByRole('button', { name: 'Saved recipient', exact: true }).click()
    await search.fill('Raksul-bank')
    await expect(page.getByRole('option')).toHaveCount(2)
    await search.fill('1842')
    await expect(page.getByRole('option')).toHaveCount(1)
    await expect(page.getByRole('option')).toContainText('Alex Rivera')
    await search.press('ArrowDown')
    await search.press('Enter')
    await expect(search).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Saved recipient', exact: true })).toContainText(
      'Alex Rivera',
    )
    await page.getByPlaceholder('0.00').fill('2.50')
    await expect(page.getByPlaceholder('0.00')).toHaveValue('2.50')
    await page.reload()
    await expect(page.getByRole('button', { name: 'Saved recipient', exact: true })).toContainText(
      'Alex Rivera',
    )
    await page.getByRole('button', { name: 'Review transfer' }).click()
    await expect(page.getByRole('heading', { name: 'Review your transfer' })).toBeVisible()
    await expect(page.getByText('Alex Rivera', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Saved recipient', exact: true })).toContainText(
      'Alex Rivera',
    )
    expect(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `test-results/saved-recipient-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    })
  })
}
test('restores draft and replays a committed request after closing the page without double debit', async ({
  page,
  context,
  environment,
}) => {
  await page.goto(`${environment.demo}/transfer`)
  await fillTransfer(page)
  await page.reload()
  await expect(page.getByPlaceholder('0.00')).toHaveValue('10.50')
  await expect(page.getByLabel('Reference')).toHaveValue('Recovered browser transfer')
  await page.getByRole('button', { name: 'Review transfer' }).click()
  const before = await readAccounts(page)
  // Simulate commit followed by losing the UI response/closing before receipt cleanup.
  const key = await page.evaluate(async () => {
    const key = Object.keys(globalThis.localStorage).find((k) =>
      k.startsWith('raksul-transfer-v1:'),
    )
    const record = JSON.parse(globalThis.localStorage.getItem(key))
    record.submitted = true
    globalThis.localStorage.setItem(key, JSON.stringify(record))
    const response = await fetch('/api/transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record.draft.request),
    })
    if (!response.ok) throw new Error('Expected committed transfer')
    return record.draft.request.idempotencyKey
  })
  await page.close()
  const restored = await context.newPage()
  await restored.goto(`${environment.demo}/transfer`)
  await expect(restored.getByRole('button', { name: 'Retry same transfer' })).toBeVisible()
  const after = await readAccounts(restored)
  expect(after[0].balanceMinor).toBe(before[0].balanceMinor - 1050)
  const posts = []
  restored.on('request', (r) => {
    if (r.method() === 'POST') posts.push(r.postDataJSON())
  })
  await restored.getByRole('button', { name: 'Retry same transfer' }).click()
  await expect(restored.getByRole('status').filter({ hasText: 'Transfer complete' })).toBeVisible()
  expect(posts[0].idempotencyKey).toBe(key)
  expect(await readAccounts(restored)).toEqual(after)
})
test('another tab refreshes balances automatically after a commit and reset', async ({
  page,
  context,
  environment,
}) => {
  await page.goto(`${environment.demo}/accounts`)
  await expect(page.getByRole('article', { name: 'Everyday Checking' })).toBeVisible()
  const before = await readAccounts(page)
  const other = await context.newPage()
  await other.goto(`${environment.demo}/transfer`)
  await fillTransfer(other)
  await other.getByRole('button', { name: 'Review transfer' }).click()
  await other.getByRole('button', { name: 'Confirm transfer' }).click()
  const money = (value) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100)
  await expect(page.getByRole('article', { name: 'Everyday Checking' })).toContainText(
    money(before[0].balanceMinor - 1050),
  )
  await other.evaluate(async () => fetch('/api/demo/reset', { method: 'POST' }))
  await expect(page.getByRole('article', { name: 'Everyday Checking' })).toContainText(
    money(before[0].balanceMinor),
  )
})

for (const save of [false, true]) {
  test(`new same-bank demo recipient transfers with save=${save}`, async ({
    page,
    environment,
  }) => {
    await page.goto(`${environment.demo}/transfer`)
    await page.getByRole('combobox', { name: 'From account' }).click()
    await page.getByRole('option', { name: /Everyday Checking/ }).click()
    await page.getByRole('radio', { name: 'Someone else' }).click()
    await expect(page.getByRole('textbox', { name: /^Account number/ })).toHaveValue('200000008319')
    await page.getByRole('button', { name: 'Check account' }).click()
    await expect(page.getByText('Verified Raksul-bank account')).toBeVisible()
    await expect(page.getByText('Jordan Lee', { exact: true })).toBeVisible()
    const checkbox = page.getByRole('checkbox', { name: 'Save recipient for next time' })
    await expect(checkbox).not.toBeChecked()
    if (save) await checkbox.check()
    await page.getByPlaceholder('0.00').fill('1.25')
    await page.getByRole('button', { name: 'Review transfer' }).click()
    await expect(page.getByRole('heading', { name: 'Review your transfer' })).toBeVisible()
    const before = await page.evaluate(async () => (await fetch('/api/beneficiaries')).json())
    expect(before.some((item) => item.accountNumber === '200000008319')).toBe(false)
    await page.getByRole('button', { name: 'Confirm transfer' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Transfer complete' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('combobox', { name: 'From account' })).toBeEnabled()
    const after = await page.evaluate(async () => (await fetch('/api/beneficiaries')).json())
    expect(after.some((item) => item.accountNumber === '200000008319')).toBe(save)
  })
}
