import { describe, expect, it } from 'vitest'
import { assertSupportedCurrency } from '../../domain/money/currency'
import {
  assertAmountMinor,
  assertBalanceMinor,
  creditBalance,
  debitBalance,
  decimalToMinor,
  minorToDecimal,
} from '../../domain/money/money'
import { maskAccountNumber } from '../../domain/accounts/maskAccountNumber'

describe('exact minor-unit money', () => {
  it.each([
    ['10.50', 1050],
    ['0.29', 29],
    ['1.2', 120],
    [' 0001.05 ', 105],
    ['0', 0],
    ['90071992547409.91', Number.MAX_SAFE_INTEGER],
  ])('parses %s without floating-point rounding', (text, minor) => {
    expect(decimalToMinor(text)).toBe(minor)
    expect(decimalToMinor(minorToDecimal(minor))).toBe(minor)
  })

  it.each(['', ' ', '-1', '+1', '.50', '1.', '1.001', '1e2', '1,000', 'NaN', 'Infinity'])(
    'rejects malformed input %j',
    (text) => {
      expect(() => decimalToMinor(text)).toThrow(
        expect.objectContaining({ code: 'INVALID_MONEY_INPUT' }),
      )
    },
  )

  it.each(['90071992547409.92', '90071992547410', '999999999999999999999999'])(
    'rejects unsafe decimal %s',
    (text) => {
      expect(() => decimalToMinor(text)).toThrow(
        expect.objectContaining({ code: 'INVALID_AMOUNT' }),
      )
    },
  )

  it.each([0, -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid transfer minor amount %s',
    (value) => {
      expect(() => assertAmountMinor(value)).toThrow(
        expect.objectContaining({ code: 'INVALID_AMOUNT' }),
      )
    },
  )

  it('allows an exact full-balance debit, but no overdraft or unsafe credit', () => {
    expect(debitBalance(1050, 1050)).toBe(0)
    expect(creditBalance(Number.MAX_SAFE_INTEGER - 1, 1)).toBe(Number.MAX_SAFE_INTEGER)
    expect(() => debitBalance(1050, 1051)).toThrow(
      expect.objectContaining({ code: 'INSUFFICIENT_FUNDS' }),
    )
    expect(() => creditBalance(Number.MAX_SAFE_INTEGER, 1)).toThrow(
      expect.objectContaining({ code: 'BALANCE_OVERFLOW' }),
    )
  })

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid balance %s',
    (value) => {
      expect(() => assertBalanceMinor(value)).toThrow(
        expect.objectContaining({ code: 'INVALID_BALANCE' }),
      )
    },
  )

  it('formats the maximum safe integer exactly', () => {
    expect(minorToDecimal(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91')
    expect(minorToDecimal(0)).toBe('0.00')
  })

  it('rejects currencies outside the agreed USD scope', () => {
    expect(() => assertSupportedCurrency('USD')).not.toThrow()
    expect(() => assertSupportedCurrency('EUR')).toThrow(
      expect.objectContaining({ code: 'UNSUPPORTED_CURRENCY' }),
    )
  })
})

describe('account masking', () => {
  it('reveals only the final four digits, ignoring display separators', () => {
    expect(maskAccountNumber('1234 5678-9012')).toBe('•••• 9012')
  })

  it.each(['', '123', '1234', '----', 'invalid-account'])(
    'fully masks short or malformed value %j',
    (value) => {
      expect(maskAccountNumber(value)).toBe('••••')
    },
  )
})
