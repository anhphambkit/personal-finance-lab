import { computed, onServerPrefetch, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import type { TransactionQuery } from '@/contracts/transactions'
import { useBankingContext } from '@/data/api/bankingContext'
import { bankingQueryKeys } from '@/data/api/bankingQueryKeys'

export function useTransactions(query: Ref<TransactionQuery | undefined>) {
  const { api, ready, session } = useBankingContext()
  const result = useQuery({
    queryKey: computed(() =>
      query.value
        ? bankingQueryKeys.transactions(session.scope.value, query.value)
        : ['bank', ...session.scope.value, 'transactions', 'invalid'],
    ),
    enabled: computed(() => ready.value && !!query.value),
    queryFn: ({ signal }) => api.transactions(query.value!, signal),
  })
  onServerPrefetch(async () => {
    if (ready.value && query.value) await result.suspense().catch(() => {})
  })
  return result
}
