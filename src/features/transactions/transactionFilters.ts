export const transactionFilterKeys = [
  'query',
  'accountId',
  'direction',
  'type',
  'status',
  'dateFrom',
  'dateTo',
] as const

export type TransactionFiltersValue = Record<(typeof transactionFilterKeys)[number], string>
