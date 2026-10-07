import { computed, onServerPrefetch, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import type { SpendingQuery } from '@/contracts/insights'
import { useBankingContext } from '@/data/api/bankingContext'
import { loadSpendingInsights } from '@/data/api/loadSpendingInsights'

export function useSpendingInsights(query: Ref<SpendingQuery | undefined>) {
  const { api, ready } = useBankingContext()
  const result = useQuery({
    queryKey: computed(() => ['bank', 'spending-insights', query.value ?? 'invalid']),
    enabled: computed(() => ready.value && !!query.value),
    queryFn: ({ signal }) => loadSpendingInsights(api, query.value!, signal),
  })
  onServerPrefetch(async () => {
    if (ready.value && query.value) await result.suspense().catch(() => {})
  })
  return result
}
