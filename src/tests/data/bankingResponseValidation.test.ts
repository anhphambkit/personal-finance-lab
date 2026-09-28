import { describe, expect, it, vi } from 'vitest'
import { createBankingApi, type BankingFetch } from '../../data/api/bankingApi'
import { createSeedState } from '../../data/seed/createSeedState'
import type { TransferRequest } from '../../contracts/transfers'

const seed = createSeedState()
const request: TransferRequest = {
  idempotencyKey: 'response-test',
  sourceAccountId: 'source',
  destination: { kind: 'OWN_ACCOUNT', accountId: 'destination' },
  amountMinor: 100,
  currency: 'USD',
}
const receipt = {
  id: 'receipt',
  sourceAccountId: request.sourceAccountId,
  destination: request.destination,
  amountMinor: 100,
  currency: 'USD',
  status: 'COMPLETED',
  createdAt: '2026-09-10T10:00:00Z',
  completedAt: '2026-09-10T10:00:00Z',
}
function apiWith(body: unknown, status = 200) {
  const fetcher = vi.fn<BankingFetch>().mockResolvedValue({
    ok: true,
    status,
    json: async () => body,
  })
  return { api: createBankingApi('/api/', fetcher), fetcher }
}
const invalid = { status: 502, code: 'INVALID_RESPONSE' }

describe('banking response validation', () => {
  it.each([
    null,
    {},
    [null],
    [{ ...seed.accounts[0], balanceMinor: '100' }],
    [{ ...seed.accounts[0], balanceMinor: Number.MAX_SAFE_INTEGER + 1 }],
    [{ ...seed.accounts[0], balanceMinor: 0.5 }],
    [{ ...seed.accounts[0], createdAt: 'yesterday' }],
    [{ ...seed.accounts[0], status: 'UNKNOWN' }],
  ])('rejects malformed accounts before callers can cache them: %j', async (body) => {
    await expect(apiWith(body).api.accounts()).rejects.toMatchObject(invalid)
  })
  it('accepts valid seed accounts and strips unexpected response fields', async () => {
    const body = seed.accounts.map((account) => ({ ...account, privateToken: 'do-not-cache' }))
    expect(await apiWith(body).api.accounts()).toEqual(seed.accounts)
  })
  it('validates every resource endpoint', async () => {
    const { api } = apiWith({})
    for (const response of [
      () => api.customer(),
      () => api.account('id'),
      () => api.transactions(),
      () => api.beneficiaries(),
      () => api.lookupRecipient('1234567890'),
      () =>
        api.createBeneficiary({
          displayName: 'Name',
          bankName: 'Bank',
          accountNumber: '1234567890',
          currency: 'USD',
        }),
      () => api.transfer('id'),
    ])
      await expect(response()).rejects.toMatchObject(invalid)
  })
  it('rejects invalid pagination while retaining valid out-of-range empty pages', async () => {
    const body = { data: [], pagination: { page: 2, pageSize: 20, totalItems: 1, totalPages: 1 } }
    expect(await apiWith(body).api.transactions()).toEqual(body)
    await expect(
      apiWith({ ...body, pagination: { ...body.pagination, totalPages: 2 } }).api.transactions(),
    ).rejects.toMatchObject(invalid)
  })
  it('normalizes invalid JSON without exposing the parser error', async () => {
    const api = createBankingApi('/api/', async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('private upstream text')
      },
    }))
    await expect(api.accounts()).rejects.toMatchObject({
      ...invalid,
      message: 'The banking response could not be verified. Please try again.',
    })
  })
  it('allows no-content only for reset', async () => {
    const { api } = apiWith(undefined, 204)
    expect(await api.reset()).toBeUndefined()
    await expect(api.accounts()).rejects.toMatchObject(invalid)
    await expect(api.executeTransfer(request)).rejects.toMatchObject(invalid)
  })
  it.each([
    { ...receipt, status: 'PENDING' },
    { ...receipt, amountMinor: -1 },
    { ...receipt, destination: { kind: 'EXTERNAL_ACCOUNT' } },
  ])('treats malformed transfer success as uncertain and never retries: %j', async (body) => {
    const { api, fetcher } = apiWith(body)
    await expect(api.executeTransfer(request)).rejects.toMatchObject(invalid)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetcher.mock.calls[0]![1].body!)).toEqual(request)
  })
  it('accepts a complete valid receipt', async () => {
    expect(await apiWith(receipt).api.executeTransfer(request)).toEqual(receipt)
  })
})
