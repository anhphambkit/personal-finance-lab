import { ApiError } from '@/data/api/apiError'

export interface TransferFailure {
  uncertain: boolean
  message: string
  conflict?: boolean
}

export const idempotencyConflictFailure: TransferFailure = {
  uncertain: false,
  conflict: true,
  message:
    'These details conflict with an earlier transfer. This attempt was not processed. Check your transaction activity for the earlier transfer before starting another payment. Retrying these details cannot resolve the conflict.',
}

export function transferFailure(error: unknown): TransferFailure {
  if (error instanceof ApiError && error.status === 409 && error.code === 'IDEMPOTENCY_CONFLICT') {
    return idempotencyConflictFailure
  }
  if (error instanceof ApiError && [400, 422].includes(error.status)) {
    return { uncertain: false, message: `${error.message} No money moved for this transfer.` }
  }
  return {
    uncertain: true,
    message:
      "We couldn't confirm whether money moved. Retry this same transfer to check its result safely. Keep this page open and don't start another transfer for the same payment.",
  }
}
