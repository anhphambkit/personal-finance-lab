import { DomainError } from '../errors'
import { MINOR_UNITS_PER_MAJOR } from './currency'

/** Runtime guard for transfer amounts; throws a domain error before arithmetic. */
export function assertAmountMinor(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new DomainError(
      'INVALID_AMOUNT',
      'The amount must be a positive safe integer in minor units.',
    )
  }
}

/** Balances may be zero, but must remain non-negative safe integer minor units. */
export function assertBalanceMinor(balanceMinor: number): void {
  if (!Number.isSafeInteger(balanceMinor) || balanceMinor < 0) {
    throw new DomainError(
      'INVALID_BALANCE',
      'The balance must be a non-negative safe integer in minor units.',
    )
  }
}

/** Parse plain USD decimal text exactly. Zero is valid text but not a valid transfer amount. */
export function decimalToMinor(text: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim())
  if (!match) {
    throw new DomainError(
      'INVALID_MONEY_INPUT',
      'Enter a decimal amount with at most two decimal places.',
    )
  }

  const whole = (match[1] ?? '').replace(/^0+/, '') || '0'
  // Bound the BigInt conversion; even the maximum safe amount has only 14 major-unit digits.
  if (whole.length > 14) {
    throw new DomainError('INVALID_AMOUNT', 'The amount exceeds the supported range.')
  }
  const fraction = (match[2] ?? '').padEnd(2, '0')
  const minor = BigInt(whole) * BigInt(MINOR_UNITS_PER_MAJOR) + BigInt(fraction)
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DomainError('INVALID_AMOUNT', 'The amount exceeds the supported range.')
  }
  return Number(minor)
}

/** Exact editable decimal text, not localized presentation formatting. */
export function minorToDecimal(amountMinor: number): string {
  assertBalanceMinor(amountMinor)
  const scale = BigInt(MINOR_UNITS_PER_MAJOR)
  const amount = BigInt(amountMinor)
  return `${amount / scale}.${String(amount % scale).padStart(2, '0')}`
}

export function debitBalance(balanceMinor: number, amountMinor: number): number {
  assertBalanceMinor(balanceMinor)
  assertAmountMinor(amountMinor)
  if (amountMinor > balanceMinor) {
    throw new DomainError('INSUFFICIENT_FUNDS', 'There are insufficient funds for this transfer.')
  }
  return balanceMinor - amountMinor
}

export function creditBalance(balanceMinor: number, amountMinor: number): number {
  assertBalanceMinor(balanceMinor)
  assertAmountMinor(amountMinor)
  if (amountMinor > Number.MAX_SAFE_INTEGER - balanceMinor) {
    throw new DomainError('BALANCE_OVERFLOW', 'The resulting balance exceeds the supported range.')
  }
  return balanceMinor + amountMinor
}
