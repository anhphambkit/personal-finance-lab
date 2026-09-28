import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { setupServer } from 'msw/node'
import { createBankingApi } from '../../data/api/bankingApi'
import { createBankingHandlers } from '../../data/mock/handlers/banking'
import { createIndexedDbBankingRepository } from '../../data/repositories/indexedDbBankingRepository'
import type { TransferRequest } from '../../contracts/transfers'
const server = setupServer()
const api = createBankingApi('http://bank.test/api/')
let repository: ReturnType<typeof createIndexedDbBankingRepository>
const request: TransferRequest = {
  idempotencyKey: 'http-request',
  sourceAccountId: 'account-checking',
  destination: { kind: 'BENEFICIARY', beneficiaryId: 'beneficiary-alex' },
  amountMinor: 29,
  currency: 'USD',
}
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  const factory = new IDBFactory()
  repository = createIndexedDbBankingRepository(() => factory)
  server.use(...createBankingHandlers(repository))
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('transfer HTTP boundary', () => {
  it('returns a receipt, replays once and keeps hidden activity out of customer queries', async () => {
    const result = await api.executeTransfer(request)
    expect(result).toMatchObject({ amountMinor: 29, status: 'COMPLETED' })
    expect(result).not.toHaveProperty('requestHash')
    expect(result).not.toHaveProperty('idempotencyKey')
    expect(await api.transfer(result.id)).toEqual(result)
    expect(await api.executeTransfer(request)).toEqual(result)
    const entries = (await api.transactions()).data.filter(
      (entry) => entry.transferId === result.id,
    )
    expect(entries).toHaveLength(1)
    expect(entries[0]!.direction).toBe('DEBIT')
    expect(
      (await repository.load()).transactions.filter((entry) => entry.transferId === result.id),
    ).toHaveLength(2)
    const before = await repository.load()
    await expect(api.executeTransfer({ ...request, amountMinor: 30 })).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_CONFLICT',
    })
    expect(await repository.load()).toEqual(before)
    await expect(api.transfer('missing')).rejects.toMatchObject({
      status: 404,
      code: 'TRANSFER_NOT_FOUND',
    })
  })
  it.each([
    { amountMinor: '1.00' },
    { amountMinor: 1.5 },
    { amountMinor: 0 },
    { amountMinor: 1e20 },
    { idempotencyKey: '' },
    { extra: true },
    { currency: 'EUR' },
    { reference: 'a'.repeat(141) },
    { destination: { kind: 'INTERNAL_ACCOUNT', accountId: 'account-internal-alex' } },
    {
      destination: {
        kind: 'BENEFICIARY',
        beneficiaryId: 'beneficiary-alex',
        recipientSnapshot: {},
      },
    },
  ])('rejects malformed input before storage: %j', async (patch) => {
    const update = vi.spyOn(repository, 'update')
    const response = await fetch('http://bank.test/api/transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, ...patch }),
    })
    expect(response.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })
  it('maps business failures with no mutation', async () => {
    const before = await repository.load()
    await expect(
      api.executeTransfer({ ...request, sourceAccountId: 'account-frozen' }),
    ).rejects.toMatchObject({ status: 422, code: 'SOURCE_NOT_ACTIVE' })
    expect(await repository.load()).toEqual(before)
  })
  it('sends JSON once on network failure without automatic retry', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network'))
    await expect(createBankingApi('/api/', fetcher).executeTransfer(request)).rejects.toMatchObject(
      { code: 'SERVICE_UNAVAILABLE' },
    )
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify(request),
      headers: { 'Content-Type': 'application/json' },
    })
  })
})
