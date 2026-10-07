import type { CreateBeneficiaryRequest } from '../../contracts/beneficiaries'
import { DomainError } from '../../domain/errors'
import type { BankingRepository } from '../ports/BankingRepository'

/** Bank directory lookup is independent of the customer's saved contacts. */
export async function lookupRecipient(
  repository: BankingRepository,
  accountNumber: string,
): Promise<CreateBeneficiaryRequest> {
  const state = await repository.load()
  const account = state.accounts.find((item) => item.accountNumber === accountNumber)
  if (
    !/^\d{8,20}$/.test(accountNumber) ||
    !account ||
    account.ownerId === state.customer.id ||
    account.status !== 'ACTIVE'
  )
    throw new DomainError('INVALID_RECIPIENT', 'This Raksul-bank recipient account is unavailable.')
  return {
    displayName: account.displayName,
    bankName: 'Raksul-bank',
    accountNumber: account.accountNumber,
    currency: account.currency,
  }
}
