import { createSeedState } from '../src/data/seed/createSeedState'
import { prepareTransfer } from '../src/features/transfers/transferDraft'
export const seed = createSeedState()
export const accounts = seed.accounts.filter((account) => account.ownerId === seed.customer.id)
export const draft = prepareTransfer(
  {
    sourceAccountId: accounts[0]!.id,
    recipientType: 'OWN_ACCOUNT',
    destinationId: accounts[1]!.id,
    recipientNetwork: 'SAME_BANK',
    recipientAccountId: '',
    recipientName: '',
    bankName: '',
    amount: '10.50',
    reference: 'Savings top-up',
  },
  accounts,
  seed.beneficiaries,
)

export const receipt = {
  id: 'transfer-story',
  sourceAccountId: draft.request.sourceAccountId,
  destination: { kind: 'OWN_ACCOUNT' as const, accountId: accounts[1]!.id },
  amountMinor: 1050,
  currency: 'USD' as const,
  reference: 'Savings top-up',
  status: 'COMPLETED' as const,
  createdAt: '2026-09-07T05:00:00Z',
  completedAt: '2026-09-07T05:00:00Z',
}
