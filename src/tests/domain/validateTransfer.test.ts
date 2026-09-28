import { describe, expect, it } from 'vitest'
import type { Account } from '../../domain/accounts/account'
import { validateTransfer } from '../../domain/transfers/validateTransfer'
import type { TransferValidationInput } from '../../domain/transfers/validateTransfer'

const source: Account = {
  id: 'checking',
  ownerId: 'customer',
  displayName: 'Checking',
  type: 'CHECKING',
  accountNumber: '1234567890',
  currency: 'USD',
  balanceMinor: 10000,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
}
const target: Account = {
  ...source,
  id: 'savings',
  type: 'SAVINGS',
  accountNumber: '2345678901',
  balanceMinor: 5000,
}
const recipientSnapshot = {
  name: 'Demo recipient',
  bankName: 'Demo bank',
  accountNumber: '9876543210',
}

function request(overrides: Partial<TransferValidationInput> = {}): TransferValidationInput {
  return {
    customerId: 'customer',
    sourceAccount: { ...source },
    destinationAccount: { ...target },
    destination: { kind: 'OWN_ACCOUNT', accountId: 'savings' },
    amountMinor: 2500,
    currency: 'USD',
    ...overrides,
  }
}

describe('transfer domain validation', () => {
  it('rejects an internal recipient snapshot that names a different account', () => {
    const input = request({
      destination: { kind: 'INTERNAL_ACCOUNT', accountId: target.id, recipientSnapshot },
      destinationAccount: { ...target, ownerId: 'other-customer' },
    })
    const before = structuredClone(input)
    expect(() => validateTransfer(input)).toThrow(
      expect.objectContaining({ code: 'INVALID_RECIPIENT' }),
    )
    expect(input).toEqual(before)
  })

  it('accepts an own transfer without modifying frozen input objects', () => {
    const input = request({
      sourceAccount: Object.freeze({ ...source }),
      destinationAccount: Object.freeze({ ...target }),
    })
    const before = structuredClone(input)
    expect(() => validateTransfer(Object.freeze(input))).not.toThrow()
    expect(input).toEqual(before)
  })

  it('accepts another-person internal and external destinations', () => {
    expect(() =>
      validateTransfer(
        request({
          destination: { kind: 'INTERNAL_ACCOUNT', accountId: target.id, recipientSnapshot },
          destinationAccount: {
            ...target,
            ownerId: 'other-customer',
            accountNumber: recipientSnapshot.accountNumber,
          },
        }),
      ),
    ).not.toThrow()
    expect(() =>
      validateTransfer(
        request({
          destination: { kind: 'EXTERNAL_ACCOUNT', recipientSnapshot },
          destinationAccount: undefined,
        }),
      ),
    ).not.toThrow()
  })

  it.each<[string, Partial<TransferValidationInput>]>([
    ['INVALID_AMOUNT', { amountMinor: 0 }],
    ['SOURCE_NOT_FOUND', { sourceAccount: undefined }],
    ['SOURCE_NOT_OWNED', { customerId: 'other-customer' }],
    ['SOURCE_NOT_ACTIVE', { sourceAccount: { ...source, status: 'FROZEN' } }],
    ['INSUFFICIENT_FUNDS', { amountMinor: source.balanceMinor + 1 }],
    ['INVALID_BALANCE', { sourceAccount: { ...source, balanceMinor: -1 } }],
    ['DESTINATION_NOT_FOUND', { destinationAccount: undefined }],
    ['DESTINATION_NOT_FOUND', { destination: { kind: 'OWN_ACCOUNT', accountId: 'unknown' } }],
    [
      'SAME_ACCOUNT',
      { destination: { kind: 'OWN_ACCOUNT', accountId: source.id }, destinationAccount: source },
    ],
    ['INVALID_DESTINATION', { destinationAccount: { ...target, ownerId: 'other-customer' } }],
    ['DESTINATION_NOT_ACTIVE', { destinationAccount: { ...target, status: 'FROZEN' } }],
    [
      'BALANCE_OVERFLOW',
      { destinationAccount: { ...target, balanceMinor: Number.MAX_SAFE_INTEGER } },
    ],
    // Deliberately model malformed boundary data to exercise runtime checks despite the USD-only type.
    [
      'CURRENCY_MISMATCH',
      { destinationAccount: { ...target, currency: 'EUR' } as unknown as Account },
    ],
    ['CURRENCY_MISMATCH', { sourceAccount: { ...source, currency: 'EUR' } as unknown as Account }],
    [
      'INVALID_RECIPIENT',
      {
        destination: {
          kind: 'EXTERNAL_ACCOUNT',
          recipientSnapshot: { ...recipientSnapshot, name: ' ' },
        },
        destinationAccount: undefined,
      },
    ],
    ['INVALID_DESTINATION', { destination: { kind: 'EXTERNAL_ACCOUNT', recipientSnapshot } }],
    [
      'INVALID_DESTINATION',
      { destination: { kind: 'INTERNAL_ACCOUNT', accountId: target.id, recipientSnapshot } },
    ],
  ])('rejects %s and leaves input unchanged', (code, overrides) => {
    const input = request(overrides)
    const before = structuredClone(input)
    expect(() => validateTransfer(input)).toThrow(expect.objectContaining({ code }))
    expect(input).toEqual(before)
  })
})
