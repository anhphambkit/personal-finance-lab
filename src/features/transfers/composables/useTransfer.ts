import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ApiError } from '@/data/api/apiError'
import { useBankingContext } from '@/data/api/bankingContext'
import { bankingQueryKeys } from '@/data/api/bankingQueryKeys'
import type { TransferRequest } from '@/contracts/transfers'

export function useTransfer() {
  const { api } = useBankingContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (request: TransferRequest) => api.executeTransfer(request),
    retry: false,
    onError: async (error) => {
      if (error instanceof ApiError && error.code === 'IDEMPOTENCY_CONFLICT') {
        // Checking activity must include the earlier payment that caused the conflict.
        await client.cancelQueries({ queryKey: bankingQueryKeys.all })
        await client.invalidateQueries({ queryKey: bankingQueryKeys.all })
      }
      // A rejected confirmation may mean another tab changed the available funds.
      if (error instanceof ApiError && [400, 422].includes(error.status)) {
        await client.invalidateQueries({ queryKey: bankingQueryKeys.accounts })
      }
    },
    onSuccess: async () => {
      await client.cancelQueries({ queryKey: bankingQueryKeys.all })
      await client.invalidateQueries({ queryKey: bankingQueryKeys.all })
    },
  })
}
