import { assertAmountMinor } from '../money/money'
import type { Transaction } from '../transactions/transaction'
import type { SpendingInsight, SpendingType } from './spendingInsight'

function selectedMonthStart(month: string): Date {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new RangeError('Select a valid month between 2000-01 and 2099-12.')
  }
  return new Date(`${month}-01T00:00:00.000Z`)
}

/** Inclusive UTC calendar dates for all six displayed months. */
export function spendingWindow(month: string): { dateFrom: string; dateTo: string } {
  const start = selectedMonthStart(month)
  return {
    dateFrom: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 5, 1))
      .toISOString()
      .slice(0, 10),
    dateTo: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10),
  }
}

function utcTransactionMonth(value: string): string {
  // Require a timezone and reject calendar rollover (Date.parse accepts February 30).
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!parts) throw new RangeError('Spending activity has an invalid timestamp.')
  const year = Number(parts[1])
  const month = Number(parts[2])
  const day = Number(parts[3])
  const daysInMonth = new Date(`${parts[1]}-${parts[2]}-01T00:00:00.000Z`)
  daysInMonth.setUTCMonth(daysInMonth.getUTCMonth() + 1, 0)
  const instant = Date.parse(value)
  if (
    year < 1000 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth.getUTCDate() ||
    Number(parts[4]) > 23 ||
    Number(parts[5]) > 59 ||
    Number(parts[6]) > 59 ||
    !Number.isFinite(instant)
  ) {
    throw new RangeError('Spending activity has an invalid timestamp.')
  }
  return new Date(instant).toISOString().slice(0, 7)
}

/** Scope first; sum completed USD spending exactly without rounding aggregate amounts. */
export function aggregateSpending(
  transactions: readonly Transaction[],
  ownedAccountIds: readonly string[],
  month: string,
  accountId?: string,
): SpendingInsight {
  const start = selectedMonthStart(month)
  const owned = new Set(ownedAccountIds)
  const months = Array.from({ length: 6 }, (_, index) => ({
    month: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 5 + index, 1))
      .toISOString()
      .slice(0, 7),
    amount: 0n,
    count: 0,
  }))
  const types: SpendingType[] = ['CARD', 'CASH', 'FEE']
  const buckets = types.map((type) => ({ type, amount: 0n, count: 0 }))

  for (const entry of transactions) {
    if (!owned.has(entry.accountId) || (accountId !== undefined && entry.accountId !== accountId))
      continue
    if (entry.status !== 'COMPLETED' || entry.direction !== 'DEBIT' || entry.currency !== 'USD')
      continue
    const bucket = buckets.find((item) => item.type === entry.type)
    if (!bucket) continue
    assertAmountMinor(entry.amountMinor)
    const entryMonth = utcTransactionMonth(entry.occurredAt)
    const trendMonth = months.find((item) => item.month === entryMonth)
    if (!trendMonth) continue
    trendMonth.amount += BigInt(entry.amountMinor)
    trendMonth.count += 1
    if (entryMonth === month) {
      bucket.amount += BigInt(entry.amountMinor)
      bucket.count += 1
    }
  }

  return {
    month,
    totalMinor: months[5]!.amount.toString(),
    previousTotalMinor: months[4]!.amount.toString(),
    count: months[5]!.count,
    breakdown: buckets.map(({ type, amount, count }) => ({
      type,
      amountMinor: amount.toString(),
      count,
    })),
    trend: months.map(({ month, amount, count }) => ({
      month,
      amountMinor: amount.toString(),
      count,
    })),
  }
}
