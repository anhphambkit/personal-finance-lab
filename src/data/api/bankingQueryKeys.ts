import type { TransactionQuery } from '../../contracts/transactions'

export const bankingQueryKeys = {
  all: ['bank'] as const,
  accounts: ['bank', 'accounts'] as const,
  beneficiaries: ['bank', 'beneficiaries'] as const,
  transactions: (query: TransactionQuery) => ['bank', 'transactions', query] as const,
  recentTransactions: ['bank', 'transactions', { page: 1, pageSize: 5 }] as const,
}
