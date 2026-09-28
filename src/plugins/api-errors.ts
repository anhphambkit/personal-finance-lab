import { definePayloadPlugin, definePayloadReducer, definePayloadReviver } from '#app'
import { ApiError } from '@/data/api/apiError'

export default definePayloadPlugin(() => {
  definePayloadReducer(
    'BankingApiError',
    (value) => value instanceof ApiError && [value.status, value.code, value.message],
  )
  definePayloadReviver('BankingApiError', (value) => {
    const [status, code, message] = value as [number, string, string]
    return new ApiError(status, code, message)
  })
})
