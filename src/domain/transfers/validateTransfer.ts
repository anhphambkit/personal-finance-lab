import type { Account } from '../accounts/account'
import { DomainError } from '../errors'
import { assertSupportedCurrency } from '../money/currency'
import type { CurrencyCode } from '../money/currency'
import { assertAmountMinor, debitBalance, creditBalance } from '../money/money'
import type { RecipientSnapshot, TransferDestination } from './transfer'

export interface TransferValidationInput {
  customerId: string
  sourceAccount: Readonly<Account> | undefined
  destination: Readonly<TransferDestination>
  destinationAccount?: Readonly<Account>
  amountMinor: number
  currency: CurrencyCode
}

function assertRecipient(snapshot: Readonly<RecipientSnapshot>): void {
  if (!snapshot.name.trim() || !snapshot.bankName.trim() || !snapshot.accountNumber.trim()) {
    throw new DomainError(
      'INVALID_RECIPIENT',
      'Recipient name, bank and account number are required.',
    )
  }
}

/**
 * Validate already-resolved domain values without mutating them.
 * Account/beneficiary lookup, untrusted payload parsing, idempotency and persistence
 * belong to the future application/data boundary, not this function.
 */
export function validateTransfer(input: Readonly<TransferValidationInput>): void {
  const {
    sourceAccount: source,
    destination,
    destinationAccount: target,
    amountMinor,
    currency,
  } = input
  assertAmountMinor(amountMinor)
  assertSupportedCurrency(currency)

  if (!source) throw new DomainError('SOURCE_NOT_FOUND', 'The source account was not found.')
  if (!input.customerId.trim() || source.ownerId !== input.customerId) {
    throw new DomainError(
      'SOURCE_NOT_OWNED',
      'The source account must belong to the current customer.',
    )
  }
  if (source.status !== 'ACTIVE') {
    throw new DomainError('SOURCE_NOT_ACTIVE', 'The source account is not available for transfers.')
  }
  if (source.currency !== currency) {
    throw new DomainError(
      'CURRENCY_MISMATCH',
      'The source account currency must match the transfer.',
    )
  }
  debitBalance(source.balanceMinor, amountMinor)

  switch (destination.kind) {
    case 'EXTERNAL_ACCOUNT':
      if (target)
        throw new DomainError(
          'INVALID_DESTINATION',
          'An external destination has no local balance.',
        )
      assertRecipient(destination.recipientSnapshot)
      return
    case 'OWN_ACCOUNT':
    case 'INTERNAL_ACCOUNT':
      if (!target || target.id !== destination.accountId) {
        throw new DomainError('DESTINATION_NOT_FOUND', 'The destination account was not found.')
      }
      if (source.id === target.id) {
        throw new DomainError(
          'SAME_ACCOUNT',
          'Choose a destination different from the source account.',
        )
      }
      if (
        (destination.kind === 'OWN_ACCOUNT' && target.ownerId !== input.customerId) ||
        (destination.kind === 'INTERNAL_ACCOUNT' && target.ownerId === input.customerId)
      ) {
        throw new DomainError(
          'INVALID_DESTINATION',
          'The destination does not match the transfer type.',
        )
      }
      if (target.status !== 'ACTIVE') {
        throw new DomainError(
          'DESTINATION_NOT_ACTIVE',
          'The destination account is not available for transfers.',
        )
      }
      if (target.currency !== currency) {
        throw new DomainError('CURRENCY_MISMATCH', 'Both accounts must use the transfer currency.')
      }
      if (destination.kind === 'INTERNAL_ACCOUNT') {
        assertRecipient(destination.recipientSnapshot)
        if (destination.recipientSnapshot.accountNumber !== target.accountNumber) {
          throw new DomainError(
            'INVALID_RECIPIENT',
            'The recipient details do not match the destination account.',
          )
        }
      }
      creditBalance(target.balanceMinor, amountMinor)
      return
    default: {
      const unexpected: never = destination
      void unexpected
      throw new DomainError(
        'INVALID_DESTINATION',
        'The transfer destination type is not supported.',
      )
    }
  }
}
