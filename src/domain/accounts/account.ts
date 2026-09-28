import type { CurrencyCode } from '../money/currency'

export interface Account {
  id: string
  ownerId: string
  displayName: string
  type: 'CHECKING' | 'SAVINGS'
  accountNumber: string
  currency: CurrencyCode
  balanceMinor: number
  status: 'ACTIVE' | 'FROZEN'
  createdAt: string
}
