import { computed, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import type { SpendingQuery } from '@/contracts/insights'
import { useBankingContext } from '@/data/api/bankingContext'
import { bankingQueryKeys } from '@/data/api/bankingQueryKeys'
import { loadSpendingInsights } from '@/data/api/loadSpendingInsights'

export function useSpendingInsights(query: Ref<SpendingQuery | undefined>) {
  const { api, ready } = useBankingContext()
  return useQuery({
    queryKey: computed(() => bankingQueryKeys.spendingInsights(query.value)),
    enabled: computed(() => ready.value && !!query.value),
    queryFn: ({ signal }) => loadSpendingInsights(api, query.value!, signal),
  })
}
