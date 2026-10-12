import type { QueryClient } from '@tanstack/vue-query'
import type { SpendingQuery } from '../../contracts/insights'
import type { TransactionQuery } from '../../contracts/transactions'

export const bankingQueryKeys = {
  all: ['bank'] as const,
  accounts: ['bank', 'accounts'] as const,
  beneficiaries: ['bank', 'beneficiaries'] as const,
  transactions: (query?: TransactionQuery) => ['bank', 'transactions', query ?? 'invalid'] as const,
  spendingInsights: (query?: SpendingQuery) =>
    ['bank', 'spending-insights', query ?? 'invalid'] as const,
}

/** After a committed change, drop in-flight reads and refetch every banking query. */
export async function refetchBankingData(client: QueryClient) {
  await client.cancelQueries({ queryKey: bankingQueryKeys.all })
  await client.invalidateQueries({ queryKey: bankingQueryKeys.all })
}
