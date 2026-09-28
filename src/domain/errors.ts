export type DomainErrorCode =
  | 'UNSUPPORTED_CURRENCY'
  | 'INVALID_MONEY_INPUT'
  | 'INVALID_AMOUNT'
  | 'INVALID_BALANCE'
  | 'BALANCE_OVERFLOW'
  | 'INSUFFICIENT_FUNDS'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_NOT_OWNED'
  | 'SOURCE_NOT_ACTIVE'
  | 'DESTINATION_NOT_FOUND'
  | 'DESTINATION_NOT_ACTIVE'
  | 'INVALID_DESTINATION'
  | 'SAME_ACCOUNT'
  | 'CURRENCY_MISMATCH'
  | 'INVALID_RECIPIENT'

/** Stable codes for the application/HTTP layer to map without exposing account details. */
export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}
