import { describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { createIndexedDbBankingRepository } from '../../data/repositories/indexedDbBankingRepository'
import { createBeneficiary } from '../../use-cases/beneficiaries/createBeneficiary'
import { executeTransfer } from '../../use-cases/transfers/executeTransfer'
const input = {
  displayName: 'New recipient',
  bankName: 'Harbor Bank',
  accountNumber: '987654321012',
  currency: 'USD' as const,
}
describe('recipient creation', () => {
  it('scopes account numbers by bank and never links an external contact to a local account', async () => {
    const factory = new IDBFactory()
    const repository = createIndexedDbBankingRepository(() => factory)
    const before = await repository.load()
    for (const account of before.accounts) {
      const contact = await createBeneficiary(repository, {
        ...input,
        accountNumber: account.accountNumber,
      })
      expect(contact.internalAccountId).toBeUndefined()
      expect(contact.bankName).toBe('Harbor Bank')
    }
    expect((await repository.load()).accounts).toEqual(before.accounts)
  })
  it('deduplicates concurrent saves and supports a persisted transfer to the new recipient', async () => {
    const factory = new IDBFactory()
    const repo = createIndexedDbBankingRepository(() => factory)
    const before = await repo.load()
    const [first, second] = await Promise.all([
      createBeneficiary(repo, input),
      createBeneficiary(
        createIndexedDbBankingRepository(() => factory),
        input,
      ),
    ])
    expect(first.id).toBe(second.id)
    expect((await repo.load()).beneficiaries).toHaveLength(before.beneficiaries.length + 1)
    const transfer = await executeTransfer(repo, {
      idempotencyKey: 'new-recipient',
      sourceAccountId: 'account-checking',
      destination: { kind: 'BENEFICIARY', beneficiaryId: first.id },
      amountMinor: 1250,
      currency: 'USD',
    })
    expect(transfer.destination).toMatchObject({
      kind: 'EXTERNAL_ACCOUNT',
      recipientSnapshot: { accountNumber: input.accountNumber },
    })
    expect((await repo.load()).accounts[0]!.balanceMinor).toBe(
      before.accounts[0]!.balanceMinor - 1250,
    )
  })
  it.each([{ accountNumber: '123' }, { bankName: 'Raksul-bank' }, { displayName: ' ' }])(
    'rejects %j without mutations',
    async (patch) => {
      const factory = new IDBFactory()
      const repo = createIndexedDbBankingRepository(() => factory)
      const before = await repo.load()
      await expect(createBeneficiary(repo, { ...input, ...patch })).rejects.toMatchObject({
        code: 'INVALID_RECIPIENT',
      })
      expect(await repo.load()).toEqual(before)
    },
  )
  it('resolves an existing internal recipient and rejects own accounts', async () => {
    const factory = new IDBFactory()
    const repo = createIndexedDbBankingRepository(() => factory)
    const state = await repo.load()
    const target = state.accounts.find((a) => a.ownerId !== state.customer.id)!
    const saved = await createBeneficiary(repo, {
      ...input,
      bankName: 'Raksul-bank',
      accountNumber: target.accountNumber,
    })
    expect(saved.internalAccountId).toBe(target.id)
    await expect(
      createBeneficiary(repo, {
        ...input,
        bankName: 'Raksul-bank',
        accountNumber: state.accounts[0]!.accountNumber,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RECIPIENT' })
  })
})
