import { DomainError } from '../../domain/errors'
import { assertBalanceMinor } from '../../domain/money/money'

const wholeDollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** Format exact USD cents, including aggregate balances larger than a safe Number. */
export function formatMoney(amountMinor: number | bigint, direction?: 'DEBIT' | 'CREDIT'): string {
  if (typeof amountMinor === 'number') assertBalanceMinor(amountMinor)
  const minor = BigInt(amountMinor)
  if (minor < 0n) throw new DomainError('INVALID_BALANCE', 'Balances must not be negative.')
  const sign = direction === 'DEBIT' ? '−' : direction === 'CREDIT' ? '+' : ''
  return `${sign}${wholeDollars.format(minor / 100n)}.${String(minor % 100n).padStart(2, '0')}`
}
