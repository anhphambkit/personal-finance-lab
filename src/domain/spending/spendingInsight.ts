export type SpendingType = 'CARD' | 'CASH' | 'FEE'

/** Exact nonnegative minor-unit totals encoded as decimal strings for transport. */
export interface SpendingBucket {
  type: SpendingType
  amountMinor: string
  count: number
}

export interface SpendingMonth {
  month: string
  amountMinor: string
  count: number
}

export interface SpendingInsight {
  month: string
  totalMinor: string
  previousTotalMinor: string
  count: number
  breakdown: SpendingBucket[]
  trend: SpendingMonth[]
}
