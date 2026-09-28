import { computed, onServerPrefetch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useBankingContext } from '@/data/api/bankingContext'
import { bankingQueryKeys } from '@/data/api/bankingQueryKeys'

export function useAccounts() {
  const { api, ready, session } = useBankingContext()
  const result = useQuery({
    queryKey: computed(() => bankingQueryKeys.accounts(session.scope.value)),
    enabled: ready,
    queryFn: ({ signal }) => api.accounts(signal),
  })
  onServerPrefetch(async () => {
    if (ready.value) await result.suspense().catch(() => {})
  })
  return result
}
