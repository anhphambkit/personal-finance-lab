import { test, expect } from './fixtures.mjs'

for (const width of [1440, 768, 390]) {
  test(`transaction drawer preserves activity and keyboard focus at ${width}px`, async ({
    page,
    environment,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`${environment.demo}/transactions?type=TRANSFER`)
    const trigger = page.getByRole('button', { name: /^View details:/ }).first()
    await expect(trigger).toBeVisible()
    const { transaction, account } = await page.evaluate(async () => {
      const [result, accounts] = await Promise.all([
        fetch('/api/transactions?type=TRANSFER').then((response) => response.json()),
        fetch('/api/accounts').then((response) => response.json()),
      ])
      const transaction = result.data[0]
      return { transaction, account: accounts.find((entry) => entry.id === transaction.accountId) }
    })
    const originalUrl = page.url()
    const requests = []
    page.on('request', (request) => {
      if (/\/api\/(?:transactions|accounts|transfers)(?:[/?]|$)/.test(request.url()))
        requests.push(request.url())
    })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const drawer = page.getByRole('dialog', { name: 'Transaction details' })
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText(transaction.description)
    await expect(drawer).toContainText(transaction.id)
    await expect(drawer).toContainText(transaction.transferId)
    await expect(drawer).toContainText(account.displayName)
    await expect(drawer).not.toContainText(account.accountNumber)
    await expect(drawer.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    expect(
      await drawer.evaluate((element) => element.contains(element.ownerDocument.activeElement)),
    ).toBe(true)
    expect(await drawer.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    )
    await page.screenshot({
      path: testInfo.outputPath(`detail-${width}.png`),
      animations: 'disabled',
    })
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(page).toHaveURL(originalUrl)
    expect(requests).toEqual([])
    // Recent activity uses the same accessible detail interaction.
    await page.goto(environment.demo)
    await page
      .getByRole('button', { name: /^View details:/ })
      .first()
      .click()
    await expect(drawer).toBeVisible()
    await drawer.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(drawer).toHaveCount(0)
  })
}
