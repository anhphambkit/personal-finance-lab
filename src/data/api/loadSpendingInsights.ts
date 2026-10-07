import { z } from 'zod'
import type { BankingApi } from '../../contracts/banking'
import type { SpendingQuery } from '../../contracts/insights'
import { aggregateSpending, spendingWindow } from '../../domain/spending/aggregateSpending'
import type { SpendingInsight } from '../../domain/spending/spendingInsight'
import type { Transaction } from '../../domain/transactions/transaction'
import { ApiError } from './apiError'

const pageSize = 100
const maximumPages = 100
const identifier = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => value.trim() === value)
const safeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const accountsSchema = z.array(z.object({ id: identifier, currency: z.literal('USD') }))
const transactionSchema = z.object({
  id: identifier,
  accountId: identifier,
  transferId: identifier.optional(),
  direction: z.enum(['DEBIT', 'CREDIT']),
  type: z.enum(['TRANSFER', 'CARD', 'CASH', 'FEE', 'INTEREST']),
  amountMinor: safeInteger.min(1),
  currency: z.literal('USD'),
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED']),
  description: z.string(),
  counterparty: z.string().optional(),
  occurredAt: z.iso.datetime({ offset: true }),
})
const responseSchema = z.object({
  data: z.array(transactionSchema).max(pageSize),
  pagination: z.object({
    page: safeInteger.min(1),
    pageSize: z.literal(pageSize),
    totalItems: safeInteger,
    totalPages: safeInteger,
  }),
})

function invalidResponse(): ApiError {
  return new ApiError(
    502,
    'INVALID_SPENDING_RESPONSE',
    'Spending data could not be verified. Please refresh and try again.',
  )
}

/** Reads the existing customer-scoped API; never publishes incomplete aggregates. */
export async function loadSpendingInsights(
  api: BankingApi,
  query: SpendingQuery,
  signal?: AbortSignal,
): Promise<SpendingInsight> {
  const window = spendingWindow(query.month)
  signal?.throwIfAborted()
  const accountsResult = accountsSchema.safeParse(await api.accounts(signal))
  signal?.throwIfAborted()
  if (!accountsResult.success) throw invalidResponse()
  const ownedIds = new Set(accountsResult.data.map((account) => account.id))
  if (ownedIds.size !== accountsResult.data.length) throw invalidResponse()
  if (query.accountId !== undefined && !ownedIds.has(query.accountId)) {
    throw new ApiError(404, 'UNKNOWN_SPENDING_ACCOUNT', 'The selected account is unavailable.')
  }

  const transactions: Transaction[] = []
  const seen = new Set<string>()
  let expectedTotal: number | undefined
  for (let page = 1; page <= maximumPages; page++) {
    signal?.throwIfAborted()
    const result = responseSchema.safeParse(
      await api.transactions(
        {
          ...window,
          ...(query.accountId === undefined ? {} : { accountId: query.accountId }),
          direction: 'DEBIT',
          status: 'COMPLETED',
          page,
          pageSize,
        },
        signal,
      ),
    )
    signal?.throwIfAborted()
    if (!result.success) throw invalidResponse()
    const { data, pagination } = result.data
    if (pagination.totalItems > maximumPages * pageSize || pagination.totalPages > maximumPages) {
      throw new ApiError(
        422,
        'SPENDING_DATA_LIMIT',
        'There is too much activity to calculate insights. Select a single account and try again.',
      )
    }
    if (
      pagination.page !== page ||
      pagination.totalPages !== Math.ceil(pagination.totalItems / pageSize) ||
      (expectedTotal !== undefined && pagination.totalItems !== expectedTotal) ||
      data.length !== Math.min(pageSize, pagination.totalItems - transactions.length)
    ) {
      throw invalidResponse()
    }
    expectedTotal = pagination.totalItems
    for (const entry of data) {
      if (
        seen.has(entry.id) ||
        !ownedIds.has(entry.accountId) ||
        (query.accountId !== undefined && entry.accountId !== query.accountId)
      )
        throw invalidResponse()
      seen.add(entry.id)
      transactions.push(entry)
    }
    if (transactions.length === expectedTotal) {
      return aggregateSpending(transactions, [...ownedIds], query.month, query.accountId)
    }
  }
  throw invalidResponse()
}
