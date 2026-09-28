import type { CurrencyCode } from '../money/currency'

export interface Beneficiary {
  id: string
  customerId: string
  displayName: string
  bankName: string
  accountNumber: string
  currency: CurrencyCode
  internalAccountId?: string
}
