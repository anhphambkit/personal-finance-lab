import type { CurrencyCode } from '../money/currency'

export interface RecipientSnapshot {
  name: string
  bankName: string
  accountNumber: string
}

export type TransferDestination =
  | { kind: 'OWN_ACCOUNT'; accountId: string }
  | { kind: 'INTERNAL_ACCOUNT'; accountId: string; recipientSnapshot: RecipientSnapshot }
  | { kind: 'EXTERNAL_ACCOUNT'; recipientSnapshot: RecipientSnapshot }

export interface Transfer {
  id: string
  idempotencyKey: string
  requestHash: string
  sourceAccountId: string
  destination: TransferDestination
  amountMinor: number
  currency: CurrencyCode
  reference?: string
  status: 'COMPLETED'
  createdAt: string
  completedAt: string
}
