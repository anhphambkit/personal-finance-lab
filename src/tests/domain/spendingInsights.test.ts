import { describe, expect, it } from 'vitest'
import { aggregateSpending, spendingWindow } from '../../domain/spending/aggregateSpending'
import type { Transaction } from '../../domain/transactions/transaction'

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'activity',
    accountId: 'owned',
    direction: 'DEBIT',
    type: 'CARD',
    amountMinor: 29,
    currency: 'USD',
    status: 'COMPLETED',
    description: 'Purchase',
    occurredAt: '2026-09-09T12:00:00.000Z',
    ...overrides,
  }
}

describe('spending insights', () => {
  it('accepts explicit UTC timestamps with sub-millisecond precision without moving calendar months', () => {
    const result = aggregateSpending(
      [
        transaction({ occurredAt: '2026-08-31T23:59:59.999999Z', amountMinor: 11 }),
        transaction({ occurredAt: '2026-09-01T00:00:00.000001Z', amountMinor: 29 }),
      ],
      ['owned'],
      '2026-09',
    )
    expect(result.totalMinor).toBe('29')
    expect(result.previousTotalMinor).toBe('11')
  })
  it('preserves exact cents beyond the safe aggregate range and counts only selected month', () => {
    const result = aggregateSpending(
      [
        transaction({ amountMinor: Number.MAX_SAFE_INTEGER }),
        transaction({ amountMinor: Number.MAX_SAFE_INTEGER }),
        transaction(),
        transaction({ type: 'FEE', amountMinor: 1 }),
        transaction({ type: 'CASH', amountMinor: 200 }),
        transaction({ occurredAt: '2026-08-31T23:59:59.999Z', amountMinor: 399 }),
      ],
      ['owned'],
      '2026-09',
    )
    expect(result.totalMinor).toBe('18014398509482212')
    expect(result.previousTotalMinor).toBe('399')
    expect(result.count).toBe(5)
    expect(result.breakdown).toEqual([
      { type: 'CARD', amountMinor: '18014398509482011', count: 3 },
      { type: 'CASH', amountMinor: '200', count: 1 },
      { type: 'FEE', amountMinor: '1', count: 1 },
    ])
    expect(result.trend[4]).toEqual({ month: '2026-08', amountMinor: '399', count: 1 })
  })

  it('excludes transfers, income, refunds, pending, failed and other currency', () => {
    const excluded: Partial<Transaction>[] = [
      { type: 'TRANSFER' },
      { type: 'INTEREST' },
      { direction: 'CREDIT' },
      { status: 'PENDING' },
      { status: 'FAILED' },
      { currency: 'EUR' as Transaction['currency'] },
    ]
    const result = aggregateSpending(
      excluded.map((entry) => transaction(entry)),
      ['owned'],
      '2026-09',
    )
    expect(result.totalMinor).toBe('0')
    expect(result.count).toBe(0)
  })

  it('scopes ownership before validation, aggregation and optional account filtering', () => {
    const entries = [
      transaction(),
      transaction({ accountId: 'second', amountMinor: 41 }),
      transaction({ accountId: 'foreign', amountMinor: NaN, occurredAt: 'bad' }),
    ]
    expect(aggregateSpending(entries, ['owned', 'second'], '2026-09').totalMinor).toBe('70')
    expect(aggregateSpending(entries, ['owned', 'second'], '2026-09', 'second').totalMinor).toBe(
      '41',
    )
    expect(aggregateSpending(entries, ['owned', 'second'], '2026-09', 'foreign').totalMinor).toBe(
      '0',
    )
    expect(aggregateSpending(entries, [], '2026-09').totalMinor).toBe('0')
    expect(aggregateSpending(entries, ['owned'], '2026-09', '').totalMinor).toBe('0')
  })

  it('uses UTC months across offset boundaries and excludes dates outside the six-month window', () => {
    const entries = [
      transaction({ occurredAt: '2026-09-01T00:30:00+01:00', amountMinor: 10 }),
      transaction({ occurredAt: '2026-08-31T23:30:00-01:00', amountMinor: 20 }),
      transaction({ occurredAt: '2026-04-01T00:00:00.000Z', amountMinor: 30 }),
      transaction({ occurredAt: '2026-03-31T23:59:59.999Z', amountMinor: 40 }),
      transaction({ occurredAt: '2026-10-01T00:00:00.000Z', amountMinor: 50 }),
    ]
    const result = aggregateSpending(entries, ['owned'], '2026-09')
    expect(result.totalMinor).toBe('20')
    expect(result.previousTotalMinor).toBe('10')
    expect(result.trend.map((entry) => entry.amountMinor)).toEqual([
      '30',
      '0',
      '0',
      '0',
      '10',
      '20',
    ])
  })

  it('zero-fills all types and six calendar months across the year boundary', () => {
    const result = aggregateSpending([], [], '2000-01')
    expect(result.trend).toEqual(
      ['1999-08', '1999-09', '1999-10', '1999-11', '1999-12', '2000-01'].map((month) => ({
        month,
        amountMinor: '0',
        count: 0,
      })),
    )
    expect(result.breakdown).toEqual(
      ['CARD', 'CASH', 'FEE'].map((type) => ({ type, amountMinor: '0', count: 0 })),
    )
    expect(spendingWindow('2000-01')).toEqual({ dateFrom: '1999-08-01', dateTo: '2000-01-31' })
    expect(spendingWindow('2024-02')).toEqual({ dateFrom: '2023-09-01', dateTo: '2024-02-29' })
    expect(spendingWindow('2099-12')).toEqual({ dateFrom: '2099-07-01', dateTo: '2099-12-31' })
  })

  it.each(['1999-12', '2100-01', '2026-00', '2026-13', '2026-9', '2026-09-01', '', ' 2026-09'])(
    'rejects invalid selected month %j',
    (month) => {
      expect(() => spendingWindow(month)).toThrow(RangeError)
      expect(() => aggregateSpending([], [], month)).toThrow(RangeError)
    },
  )

  it.each([0, -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects unsafe spending amount %s instead of returning partial totals',
    (amountMinor) => {
      expect(() =>
        aggregateSpending([transaction(), transaction({ amountMinor })], ['owned'], '2026-09'),
      ).toThrow()
    },
  )

  it.each([
    'bad',
    '2026-02-30T12:00:00Z',
    '2026-09-09T24:00:00Z',
    '2026-09-09T12:00:00',
    '2026-09-09',
    '2026-13-01T00:00:00Z',
  ])('rejects invalid or timezone-ambiguous date %j', (occurredAt) => {
    expect(() =>
      aggregateSpending([transaction(), transaction({ occurredAt })], ['owned'], '2026-09'),
    ).toThrow(RangeError)
  })
})
