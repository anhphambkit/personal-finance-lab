import type { TransactionQuery } from '../../contracts/transactions'

type Scope = readonly [string | null, number]
export const bankingQueryKeys = {
  all: ['bank'] as const,
  accounts: (scope: Scope) => ['bank', ...scope, 'accounts'] as const,
  beneficiaries: (scope: Scope) => ['bank', ...scope, 'beneficiaries'] as const,
  transactions: (scope: Scope, query: TransactionQuery) =>
    ['bank', ...scope, 'transactions', query] as const,
}
