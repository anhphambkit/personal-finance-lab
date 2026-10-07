import { describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { createIndexedDbBankingRepository } from '../../data/repositories/indexedDbBankingRepository'
import { lookupRecipient } from '../../use-cases/beneficiaries/lookupRecipient'
import { executeTransfer } from '../../use-cases/transfers/executeTransfer'

function repository() {
  const factory = new IDBFactory()
  return createIndexedDbBankingRepository(() => factory)
}

describe('same-bank recipient directory', () => {
  it('looks up an unsaved recipient without exposing their balance or saving a contact', async () => {
    const repo = repository()
    const before = await repo.load()
    expect(await lookupRecipient(repo, '200000008319')).toEqual({
      displayName: 'Jordan Lee',
      bankName: 'Raksul-bank',
      accountNumber: '200000008319',
      currency: 'USD',
    })
    expect(await repo.load()).toEqual(before)
    for (const number of ['123', '999999999999', '100000004821'])
      await expect(lookupRecipient(repo, number)).rejects.toMatchObject({
        code: 'INVALID_RECIPIENT',
      })
  })

  it.each([true, false])(
    'credits an unsaved internal account, saving a contact only for opt-in=%s',
    async (saveRecipient) => {
      const repo = repository()
      const before = await repo.load()
      const recipient = await lookupRecipient(repo, '200000008319')
      const request = {
        idempotencyKey: 'new-internal',
        sourceAccountId: 'account-checking',
        destination: {
          kind: 'NEW_BENEFICIARY' as const,
          beneficiary: { ...recipient, displayName: 'Tampered name' },
          saveRecipient,
        },
        amountMinor: 125,
        currency: 'USD' as const,
      }
      const result = await executeTransfer(repo, request)
      expect(result.destination).toMatchObject({
        kind: 'INTERNAL_ACCOUNT',
        accountId: 'account-internal-jordan',
        recipientSnapshot: { name: 'Jordan Lee' },
      })
      expect(await executeTransfer(repo, request)).toEqual(result)
      const after = await repo.load()
      expect(
        after.accounts.find((item) => item.id === 'account-internal-jordan')!.balanceMinor,
      ).toBe(125)
      expect(after.accounts[0]!.balanceMinor).toBe(before.accounts[0]!.balanceMinor - 125)
      expect(after.transactions.filter((item) => item.transferId === result.id)).toHaveLength(2)
      expect(after.beneficiaries.length).toBe(before.beneficiaries.length + Number(saveRecipient))
    },
  )

  it('adds the new directory account to an older snapshot without resetting balances or saved contacts', async () => {
    const repo = repository()
    await repo.update((state) => {
      state.accounts = state.accounts.filter((item) => item.id !== 'account-internal-jordan')
      state.accounts[0]!.balanceMinor = 98765
      state.beneficiaries[0]!.displayName = 'My saved label'
      return state
    })
    const migrated = await repo.load()
    expect(migrated.accounts[0]!.balanceMinor).toBe(98765)
    expect(migrated.beneficiaries[0]!.displayName).toBe('My saved label')
    expect(migrated.beneficiaries).toHaveLength(6)
    expect(migrated.accounts.filter((item) => item.id === 'account-internal-jordan')).toHaveLength(
      1,
    )
    expect(await repo.load()).toEqual(migrated)
  })
})
