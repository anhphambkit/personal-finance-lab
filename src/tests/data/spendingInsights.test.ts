import { describe, expect, it, vi } from 'vitest'
import { createBankingApi, type BankingFetch } from '../../data/api/bankingApi'
import { ApiError } from '../../data/api/apiError'
import { loadSpendingInsights } from '../../data/api/loadSpendingInsights'
import type { Transaction } from '../../domain/transactions/transaction'

function transaction(id: number, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `entry-${id}`,
    accountId: 'owned',
    direction: 'DEBIT',
    type: 'CARD',
    amountMinor: 125,
    currency: 'USD',
    status: 'COMPLETED',
    description: 'Purchase',
    occurredAt: '2026-09-03T00:00:00Z',
    ...overrides,
  }
}

function page(data: Transaction[], current = 1, totalItems = data.length) {
  return {
    data,
    pagination: {
      page: current,
      pageSize: 100,
      totalItems,
      totalPages: Math.ceil(totalItems / 100),
    },
  }
}

function fixture(responses: unknown[], accounts: unknown = [{ id: 'owned', currency: 'USD' }]) {
  let index = 0
  const fetcher = vi.fn<BankingFetch>(async (url) => ({
    ok: true,
    status: 200,
    json: async () => (url.endsWith('/accounts') ? accounts : responses[index++]),
  }))
  const api = createBankingApi('/api/', fetcher)
  return { api, fetcher }
}

describe('spending insights API boundary', () => {
  it('loads every page with date/status/direction filters and the same abort signal', async () => {
    const first = Array.from({ length: 100 }, (_, id) => transaction(id))
    const { api, fetcher } = fixture([
      page(first, 1, 101),
      page([transaction(100, { occurredAt: '2026-08-01T00:00:00Z', amountMinor: 200 })], 2, 101),
    ])
    const signal = new AbortController().signal
    const result = await loadSpendingInsights(api, { month: '2026-09', accountId: 'owned' }, signal)
    expect(result).toMatchObject({ totalMinor: '12500', previousTotalMinor: '200', count: 100 })
    expect(fetcher).toHaveBeenCalledTimes(3)
    for (const [url, init] of fetcher.mock.calls) {
      expect(init.signal).toBe(signal)
      if (url.includes('transactions')) {
        const params = new URL(url, 'https://fixture.test').searchParams
        expect(Object.fromEntries(params)).toMatchObject({
          accountId: 'owned',
          direction: 'DEBIT',
          status: 'COMPLETED',
          dateFrom: '2026-04-01',
          dateTo: '2026-09-30',
          pageSize: '100',
        })
      }
    }
    expect(fetcher.mock.calls[2]?.[0]).toContain('page=2')
  })

  it('returns exact totals over the safe integer boundary', async () => {
    const { api } = fixture([
      page([transaction(1, { amountMinor: Number.MAX_SAFE_INTEGER }), transaction(2)]),
    ])
    expect((await loadSpendingInsights(api, { month: '2026-09' })).totalMinor).toBe(
      (BigInt(Number.MAX_SAFE_INTEGER) + 125n).toString(),
    )
  })

  it('returns a zero aggregate for a valid empty result', async () => {
    const { api } = fixture([page([])])
    expect(await loadSpendingInsights(api, { month: '2026-09' })).toMatchObject({
      totalMinor: '0',
      previousTotalMinor: '0',
      count: 0,
    })
  })

  it('rejects an unknown account before requesting any transactions', async () => {
    const { api, fetcher } = fixture([])
    await expect(
      loadSpendingInsights(api, { month: '2026-09', accountId: 'someone-else' }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_SPENDING_ACCOUNT', status: 404 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('rejects activity from another owned account when one account is selected', async () => {
    const { api } = fixture(
      [page([transaction(1, { accountId: 'other' })])],
      [
        { id: 'owned', currency: 'USD' },
        { id: 'other', currency: 'USD' },
      ],
    )
    await expect(
      loadSpendingInsights(api, { month: '2026-09', accountId: 'owned' }),
    ).rejects.toMatchObject({ code: 'INVALID_SPENDING_RESPONSE' })
  })

  it.each([
    null,
    [{ id: 'owned', currency: 'EUR' }],
    [{ currency: 'USD' }],
    [
      { id: 'owned', currency: 'USD' },
      { id: 'owned', currency: 'USD' },
    ],
  ])('rejects invalid account data without echoing the payload: %j', async (accounts) => {
    const { api, fetcher } = fixture([], accounts)
    await expect(loadSpendingInsights(api, { month: '2026-09' })).rejects.toMatchObject({
      code: 'INVALID_SPENDING_RESPONSE',
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each([
    { amountMinor: -1 },
    { amountMinor: 0.5 },
    { amountMinor: Number.MAX_SAFE_INTEGER + 1 },
    { currency: 'EUR' },
    { occurredAt: '2026-02-30T00:00:00Z' },
    { occurredAt: '2026-09-01' },
    { status: 'UNKNOWN' },
    { direction: 'UNKNOWN' },
    { type: 'UNKNOWN' },
    { accountId: 'someone-else' },
    { id: '' },
  ])('rejects invalid or unowned transaction fields: %j', async (overrides) => {
    const response = page([transaction(1)])
    const { api } = fixture([{ ...response, data: [{ ...transaction(1), ...overrides }] }])
    await expect(loadSpendingInsights(api, { month: '2026-09' })).rejects.toMatchObject({
      code: 'INVALID_SPENDING_RESPONSE',
    })
  })

  it.each([
    { page: 2 },
    { pageSize: 20 },
    { totalItems: 2 },
    { totalItems: -1 },
    { totalPages: 2 },
  ])('rejects inconsistent pagination: %j', async (overrides) => {
    const response = page([transaction(1)])
    const { api } = fixture([{ ...response, pagination: { ...response.pagination, ...overrides } }])
    await expect(loadSpendingInsights(api, { month: '2026-09' })).rejects.toMatchObject({
      code: 'INVALID_SPENDING_RESPONSE',
    })
  })

  it('rejects repeated IDs across pages without returning a partial total', async () => {
    const first = Array.from({ length: 100 }, (_, id) => transaction(id))
    const { api } = fixture([page(first, 1, 101), page([transaction(1)], 2, 101)])
    await expect(loadSpendingInsights(api, { month: '2026-09' })).rejects.toMatchObject({
      code: 'INVALID_SPENDING_RESPONSE',
    })
  })

  it.each(['changed total', 'repeated page', 'empty page'])(
    'rejects %s after a full page',
    async (kind) => {
      const first = Array.from({ length: 100 }, (_, id) => transaction(id))
      const second = kind === 'empty page' ? page([], 2, 101) : page([transaction(100)], 2, 101)
      if (kind === 'changed total') second.pagination.totalItems = 102
      if (kind === 'repeated page') second.pagination.page = 1
      const { api } = fixture([page(first, 1, 101), second])
      await expect(loadSpendingInsights(api, { month: '2026-09' })).rejects.toMatchObject({
        code: 'INVALID_SPENDING_RESPONSE',
      })
    },
  )

  it('fails explicitly above the 10,000 transaction cap', async () => {
    const { api, fetcher } = fixture([
      page(
        Array.from({ length: 100 }, (_, id) => transaction(id)),
        1,
        10001,
      ),
    ])
    await expect(loadSpendingInsights(api, { month: '2026-09' })).rejects.toMatchObject({
      code: 'SPENDING_DATA_LIMIT',
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('includes the last page at the 10,000 transaction limit', async () => {
    const responses = Array.from({ length: 100 }, (_, pageIndex) =>
      page(
        Array.from({ length: 100 }, (_, index) => transaction(pageIndex * 100 + index)),
        pageIndex + 1,
        10000,
      ),
    )
    const { api, fetcher } = fixture(responses)
    expect(await loadSpendingInsights(api, { month: '2026-09' })).toMatchObject({
      totalMinor: '1250000',
      count: 10000,
    })
    expect(fetcher).toHaveBeenCalledTimes(101)
  })

  it('propagates a later API failure instead of publishing the first page', async () => {
    const { api } = fixture([
      page(
        Array.from({ length: 100 }, (_, id) => transaction(id)),
        1,
        101,
      ),
    ])
    const original = api.transactions.bind(api)
    const failure = new ApiError(503, 'SERVICE_UNAVAILABLE', 'Please try again.')
    vi.spyOn(api, 'transactions').mockImplementationOnce(original).mockRejectedValueOnce(failure)
    await expect(loadSpendingInsights(api, { month: '2026-09' })).rejects.toBe(failure)
  })

  it('does not start requests for an already aborted signal', async () => {
    const { api, fetcher } = fixture([])
    const controller = new AbortController()
    controller.abort()
    await expect(
      loadSpendingInsights(api, { month: '2026-09' }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not continue pagination when cancellation occurs during a response', async () => {
    const { api } = fixture([])
    const controller = new AbortController()
    const requests = vi.spyOn(api, 'transactions').mockImplementation(async () => {
      controller.abort()
      return page(
        Array.from({ length: 100 }, (_, id) => transaction(id)),
        1,
        101,
      )
    })
    await expect(
      loadSpendingInsights(api, { month: '2026-09' }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(requests).toHaveBeenCalledTimes(1)
  })
})
