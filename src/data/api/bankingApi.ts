import type { TransactionQuery } from '../../contracts/transactions'
import type { BankingApi } from '../../contracts/banking'
import type { TransferRequest } from '../../contracts/transfers'
import type { z } from 'zod'
import {
  customerResponseSchema,
  accountResponseSchema,
  accountsResponseSchema,
  transactionsResponseSchema,
  recipientResponseSchema,
  beneficiaryResponseSchema,
  beneficiariesResponseSchema,
  transferReceiptResponseSchema,
  resetResponseSchema,
} from './bankingResponseSchemas'
import { ApiError } from './apiError'

/** Validated boundary for banking API responses. Abort signals pass through to fetch. */
export type BankingFetch = (
  url: string,
  init: { method: string; signal?: AbortSignal; headers: Record<string, string>; body?: string },
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>

export function createBankingApi(
  baseUrl = '/api/',
  fetcher: BankingFetch = (url, init) => fetch(url, init),
): BankingApi {
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
    method = 'GET',
    body?: unknown,
  ): Promise<T> {
    const response = await fetcher(`${baseUrl.replace(/\/?$/, '/')}${path}`, {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }).catch((error: unknown) => {
      if (signal?.aborted) throw error
      throw new ApiError(
        503,
        'SERVICE_UNAVAILABLE',
        'The banking service is unavailable. Please try again.',
      )
    })
    if (!response.ok) {
      let code = 'REQUEST_FAILED'
      let message = 'The request could not be completed. Please try again.'
      try {
        const body: unknown = await response.json()
        if (
          body &&
          typeof body === 'object' &&
          'error' in body &&
          body.error &&
          typeof body.error === 'object'
        ) {
          if ('code' in body.error && typeof body.error.code === 'string') code = body.error.code
          if ('message' in body.error && typeof body.error.message === 'string')
            message = body.error.message
        }
      } catch {
        /* Keep a safe message for non-JSON failures. */
      }
      throw new ApiError(response.status, code, message)
    }
    try {
      const body: unknown = response.status === 204 ? undefined : await response.json()
      const result = schema.safeParse(body)
      if (result.success) return result.data
    } catch (error) {
      if (signal?.aborted) throw error
    }
    // A malformed mutation response is an unknown outcome, not a terminal rejection.
    throw new ApiError(
      502,
      'INVALID_RESPONSE',
      'The banking response could not be verified. Please try again.',
    )
  }
  return {
    customer: (signal?: AbortSignal) => request('customer', customerResponseSchema, signal),
    accounts: (signal?: AbortSignal) => request('accounts', accountsResponseSchema, signal),
    account: (id: string, signal?: AbortSignal) =>
      request(`accounts/${encodeURIComponent(id)}`, accountResponseSchema, signal),
    transactions: (query: Partial<TransactionQuery> = {}, signal?: AbortSignal) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query))
        if (value !== undefined) params.set(key, String(value))
      return request(`transactions?${params}`, transactionsResponseSchema, signal)
    },
    lookupRecipient: (accountNumber, signal) =>
      request(
        `recipient-accounts/${encodeURIComponent(accountNumber)}`,
        recipientResponseSchema,
        signal,
      ),
    beneficiaries: (signal?: AbortSignal) =>
      request('beneficiaries', beneficiariesResponseSchema, signal),
    createBeneficiary: (body) =>
      request('beneficiaries', beneficiaryResponseSchema, undefined, 'POST', body),
    executeTransfer: (body: TransferRequest) =>
      request('transfers', transferReceiptResponseSchema, undefined, 'POST', body),
    transfer: (id: string, signal?: AbortSignal) =>
      request(`transfers/${encodeURIComponent(id)}`, transferReceiptResponseSchema, signal),
    reset: (signal?: AbortSignal) => request('demo/reset', resetResponseSchema, signal, 'POST'),
  }
}
