import { computed, onServerPrefetch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useBankingContext } from '@/data/api/bankingContext'
import { bankingQueryKeys } from '@/data/api/bankingQueryKeys'
export function useBeneficiaries() {
  const { api, ready, session } = useBankingContext()
  const result = useQuery({
    queryKey: computed(() => bankingQueryKeys.beneficiaries(session.scope.value)),
    enabled: ready,
    queryFn: ({ signal }) => api.beneficiaries(signal),
  })
  onServerPrefetch(async () => {
    if (ready.value) await result.suspense().catch(() => {})
  })
  return result
}
