import type { useRequestFetch } from '#app'
import type { BankingFetch } from '@/data/api/bankingApi'

/** Adapt Nuxt's request-scoped fetch while retaining HTTP status and disabling retries. */
export function createRequestBankingFetch(
  requestFetch: ReturnType<typeof useRequestFetch>,
): BankingFetch {
  return async (url, init) => {
    try {
      let responseStatus: number | undefined
      const data = await requestFetch(url, {
        ...init,
        method: init.method as 'GET' | 'POST',
        retry: 0,
        timeout: 15_000,
        onResponse({ response }) {
          responseStatus = response.status
        },
      })
      if (responseStatus === undefined) throw new Error('Banking response status is missing.')
      return {
        ok: responseStatus >= 200 && responseStatus < 300,
        status: responseStatus,
        json: async () => data,
      }
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'statusCode' in error &&
        typeof error.statusCode === 'number'
      ) {
        return {
          ok: false,
          status: error.statusCode,
          json: async () => ('data' in error ? error.data : undefined),
        }
      }
      throw error
    }
  }
}
