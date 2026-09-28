import { test, expect, readAccounts } from './fixtures.mjs'

async function expectFits(page) {
  expect(
    await page.locator('main').evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true)
}

for (const width of [1440, 768, 390]) {
  test(`core navigation, masking, filters and review at ${width}px`, async ({
    page,
    environment,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    const errors = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.goto(environment.demo)
    await expect(page.getByRole('article', { name: 'Everyday Checking' })).toBeVisible()
    const accounts = await readAccounts(page)
    const assertMasked = async () => {
      const text = await page.locator('body').innerText()
      for (const account of accounts) expect(text).not.toContain(account.accountNumber)
    }
    await assertMasked()
    await expectFits(page)
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`overview-${width}.png`),
    })

    async function navigate(name) {
      if (width < 1024) {
        await page.getByRole('button', { name: 'Open navigation' }).focus()
        await page.keyboard.press('Enter')
      }
      const link = page.getByRole('link', { name, exact: true })
      await link.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('main')).toBeFocused()
      if (width < 1024) await expect(page.getByRole('dialog')).toHaveCount(0)
    }
    await navigate('Accounts')
    await expect(page.getByRole('article', { name: 'Travel Reserve' })).toContainText('Frozen')
    await assertMasked()
    await expectFits(page)
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`accounts-${width}.png`),
    })
    await navigate('Transactions')
    await page.getByLabel('Search transactions').fill('no-matching-activity-qa')
    await page.getByRole('button', { name: 'Apply filters' }).click()
    await expect(page.getByRole('heading', { name: 'No matching transactions' })).toBeVisible()
    await page.getByRole('button', { name: 'Show all transactions' }).click()
    await expect(page.getByRole('status').filter({ hasText: '100 transactions' })).toBeVisible()
    await expectFits(page)
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`transactions-${width}.png`),
    })

    await navigate('Transfer')
    const source = page.getByRole('combobox', { name: 'From account' })
    await expect(source).toBeEnabled()
    await source.click()
    await expect(page.getByRole('option', { name: /Travel Reserve/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await page.getByRole('option', { name: /Everyday Checking/ }).click()
    await page.getByRole('combobox', { name: 'To account' }).click()
    await expect(page.getByRole('option', { name: /Everyday Checking/ })).toHaveCount(0)
    await page.getByRole('option', { name: /Rainy Day Savings/ }).click()
    const amount = page.getByRole('textbox', { name: /^Amount/ })
    await amount.fill('999999')
    await page.getByRole('button', { name: 'Review transfer' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('This amount exceeds your available balance.')).toBeVisible()
    await expect(amount).toBeFocused()
    await expect(amount).toHaveAttribute('aria-invalid', 'true')
    const describedBy = await amount.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    await expect(page.locator(`[id="${describedBy.split(' ')[0]}"]`)).toContainText(
      'available balance',
    )
    await amount.fill('10.29')
    await page.getByLabel('Reference').fill('Responsive review')
    await page.getByRole('button', { name: 'Review transfer' }).click()
    await expect(page.getByRole('heading', { name: 'Review your transfer' })).toBeVisible()
    await assertMasked()
    await expectFits(page)
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`review-${width}.png`),
    })
    expect(await readAccounts(page)).toEqual(accounts)
    expect(errors).toEqual([])
  })
}
