import { useQuery } from '@tanstack/vue-query'
import { useBankingContext } from '@/data/api/bankingContext'
import { bankingQueryKeys } from '@/data/api/bankingQueryKeys'

export function useBeneficiaries() {
  const { api, ready } = useBankingContext()
  return useQuery({
    queryKey: bankingQueryKeys.beneficiaries,
    enabled: ready,
    queryFn: ({ signal }) => api.beneficiaries(signal),
  })
}
