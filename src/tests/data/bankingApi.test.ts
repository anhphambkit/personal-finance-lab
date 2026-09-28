import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createBankingApi } from '../../data/api/bankingApi'
import { createBankingHandlers, mockLatency } from '../../data/mock/handlers/banking'
import { createIndexedDbBankingRepository } from '../../data/repositories/indexedDbBankingRepository'
import { createSeedState } from '../../data/seed/createSeedState'
import { RepositoryError, type BankingRepository } from '../../use-cases/ports/BankingRepository'

const server = setupServer()
const api = createBankingApi('http://bank.test/api/')
let repository: BankingRepository
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  const factory = new IDBFactory()
  repository = createIndexedDbBankingRepository(() => factory)
  server.use(...createBankingHandlers(repository))
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('typed mock banking API', () => {
  it.each([
    ['FETCH', 1_000, 1_800],
    ['LOOKUP', 1_200, 2_200],
    ['UPDATE', 1_800, 2_600],
    ['TRANSFER', 2_200, 3_000],
  ] as const)(
    'keeps %s demo latency within its configured range',
    (operation, minimum, maximum) => {
      expect(mockLatency(operation, () => 0)).toBe(minimum)
      expect(mockLatency(operation, () => 0.999_999)).toBe(maximum)
    },
  )

  it('returns the customer, owned accounts including frozen, and beneficiaries', async () => {
    expect((await api.customer()).id).toBe('customer-taylor')
    const accounts = await api.accounts()
    expect(accounts).toHaveLength(3)
    expect(accounts.map((item) => item.status)).toEqual(['ACTIVE', 'ACTIVE', 'FROZEN'])
    expect(await api.account('account-checking')).toEqual(accounts[0])
    expect(await api.beneficiaries()).toHaveLength(6)
  })

  it.each(['account-internal-alex', 'missing'])('does not reveal account %s', async (id) => {
    await expect(api.account(id)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'The requested account was not found.',
    })
    await expect(api.transactions({ accountId: id })).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    })
  })

  it('scopes activity and counts before applying filters or pagination', async () => {
    await repository.update((state) => {
      state.transactions.push({
        ...state.transactions[0]!,
        id: 'hidden-entry',
        accountId: 'account-internal-alex',
        description: 'Hidden activity',
        occurredAt: '2026-09-01T00:00:00.000Z',
      })
      return state
    })
    const result = await api.transactions()
    expect(result.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 100, totalPages: 5 })
    expect(result.data).toHaveLength(20)
    expect(result.data.every((item) => item.accountId !== 'account-internal-alex')).toBe(true)
    expect((await api.transactions({ query: 'Hidden activity' })).pagination.totalItems).toBe(0)
  })

  it('applies combined filters, case-insensitive search and stable newest-first ordering', async () => {
    const result = await api.transactions({
      accountId: 'account-checking',
      query: '  GREEN basket ',
      direction: 'DEBIT',
      type: 'CARD',
      status: 'COMPLETED',
      dateFrom: '2026-04-01',
      dateTo: '2026-05-31',
    })
    expect(result.data.map((item) => item.occurredAt.slice(0, 7))).toEqual(['2026-05', '2026-04'])
    expect(result.pagination.totalItems).toBe(2)
    const pageOne = await api.transactions({ page: 1, pageSize: 7 })
    const pageTwo = await api.transactions({ page: 2, pageSize: 7 })
    expect(new Set([...pageOne.data, ...pageTwo.data].map((entry) => entry.id)).size).toBe(14)
    expect(await api.transactions({ page: 1, pageSize: 7 })).toEqual(pageOne)
  })

  it('includes the entire UTC end date and excludes the next midnight', async () => {
    await repository.update((state) => {
      for (const [id, occurredAt] of [
        ['edge-end', '2026-08-31T23:59:59.999Z'],
        ['edge-next', '2026-09-01T00:00:00.000Z'],
      ]) {
        state.transactions.push({
          ...state.transactions[0]!,
          id: id!,
          description: 'Boundary entry',
          occurredAt: occurredAt!,
        })
      }
      return state
    })
    const result = await api.transactions({
      query: 'Boundary entry',
      dateFrom: '2026-08-31',
      dateTo: '2026-08-31',
    })
    expect(result.data.map((entry) => entry.id)).toEqual(['edge-end'])
  })

  it('supports status filters and empty/out-of-range pages', async () => {
    expect((await api.transactions({ status: 'PENDING' })).pagination.totalItems).toBe(2)
    expect((await api.transactions({ status: 'FAILED' })).pagination.totalItems).toBe(2)
    expect(await api.transactions({ query: 'no such purchase' })).toEqual({
      data: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    })
    expect(await api.transactions({ page: 100 })).toEqual({
      data: [],
      pagination: { page: 100, pageSize: 20, totalItems: 100, totalPages: 5 },
    })
  })

  it.each([
    'page=0',
    'page=-1',
    'page=1.5',
    'page=1e2',
    'pageSize=101',
    'direction=debit',
    'type=OTHER',
    'status=OTHER',
    'dateFrom=2026-02-30',
    'dateFrom=2026-08-01&dateTo=2026-07-01',
    'page=1&page=2',
    'unknown=value',
    'accountId=',
  ])('rejects invalid query %s before reading storage', async (query) => {
    const load = vi.spyOn(repository, 'load')
    const result = await fetch(`http://bank.test/api/transactions?${query}`)
    expect(result.status).toBe(400)
    expect(await result.json()).toMatchObject({ error: { code: 'INVALID_QUERY' } })
    expect(load).not.toHaveBeenCalled()
  })

  it('reset commits deterministic seed and returns no privileged state', async () => {
    await repository.update((state) => {
      state.accounts[0]!.displayName = 'Changed'
      return state
    })
    expect(await api.reset()).toBeUndefined()
    expect(await repository.load()).toEqual(createSeedState())
    const result = await fetch('http://bank.test/api/demo/reset', { method: 'POST' })
    expect(result.status).toBe(204)
    expect(await result.text()).toBe('')
  })

  it('maps storage failures without exposing internal error details', async () => {
    vi.spyOn(repository, 'load').mockRejectedValue(
      new RepositoryError('STORAGE_OPEN_FAILED', 'private storage detail'),
    )
    await expect(api.accounts()).rejects.toMatchObject({ status: 503, code: 'STORAGE_UNAVAILABLE' })
    const result = await fetch('http://bank.test/api/accounts')
    expect(await result.text()).not.toContain('private storage detail')
  })

  it('does not claim reset success when persistence fails', async () => {
    vi.spyOn(repository, 'reset').mockRejectedValue(
      new RepositoryError('STORAGE_WRITE_FAILED', 'write failed'),
    )
    await expect(api.reset()).rejects.toMatchObject({ status: 503 })
  })

  it('handles unexpected errors and non-JSON HTTP errors safely', async () => {
    vi.spyOn(repository, 'load').mockRejectedValue(new Error('private detail'))
    await expect(api.customer()).rejects.toMatchObject({ status: 500, code: 'INTERNAL_ERROR' })
    server.use(
      http.get(
        '*/api/customer',
        () => new HttpResponse('<html>Bad gateway</html>', { status: 502 }),
      ),
    )
    await expect(api.customer()).rejects.toMatchObject({ status: 502, code: 'REQUEST_FAILED' })
  })

  it('passes cancellation through without converting it to an API error', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(api.accounts(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
