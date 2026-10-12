import { computed, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import type { TransactionQuery } from '@/contracts/transactions'
import { useBankingContext } from '@/data/api/bankingContext'
import { bankingQueryKeys } from '@/data/api/bankingQueryKeys'

/** An undefined query (an invalid URL) keeps the request disabled. */
export function useTransactions(query: Ref<TransactionQuery | undefined>) {
  const { api, ready } = useBankingContext()
  return useQuery({
    queryKey: computed(() => bankingQueryKeys.transactions(query.value)),
    enabled: computed(() => ready.value && !!query.value),
    queryFn: ({ signal }) => api.transactions(query.value!, signal),
  })
}
