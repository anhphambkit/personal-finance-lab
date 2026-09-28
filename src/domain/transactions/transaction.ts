import type { CurrencyCode } from '../money/currency'

export interface Transaction {
  id: string
  accountId: string
  transferId?: string
  direction: 'DEBIT' | 'CREDIT'
  type: 'TRANSFER' | 'CARD' | 'CASH' | 'FEE' | 'INTEREST'
  amountMinor: number
  currency: CurrencyCode
  status: 'PENDING' | 'COMPLETED' | 'FAILED'
  description: string
  counterparty?: string
  occurredAt: string
}
