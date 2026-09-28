import { DomainError } from '../errors'

/** The demo supports USD only. Adding currencies requires an explicit scale/display decision. */
export type CurrencyCode = 'USD'

export const MINOR_UNITS_PER_MAJOR = 100

export function assertSupportedCurrency(value: unknown): asserts value is CurrencyCode {
  if (value !== 'USD') {
    throw new DomainError('UNSUPPORTED_CURRENCY', 'This demo supports USD only.')
  }
}
