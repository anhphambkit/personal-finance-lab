import type { CreateBeneficiaryRequest } from './beneficiaries'
import type { Account } from '../domain/accounts/account'
import type { Beneficiary } from '../domain/beneficiaries/beneficiary'
import type { Customer } from '../domain/customers/customer'
import type { PaginatedTransactions, TransactionQuery } from './transactions'

import type { TransferRequest, TransferReceipt } from './transfers'

/** Public client contract; transport and persistence details belong to adapters. */
export interface BankingApi {
  customer(signal?: AbortSignal): Promise<Customer>
  accounts(signal?: AbortSignal): Promise<Account[]>
  account(id: string, signal?: AbortSignal): Promise<Account>
  transactions(
    query?: Partial<TransactionQuery>,
    signal?: AbortSignal,
  ): Promise<PaginatedTransactions>
  lookupRecipient(accountNumber: string, signal?: AbortSignal): Promise<CreateBeneficiaryRequest>
  beneficiaries(signal?: AbortSignal): Promise<Beneficiary[]>
  createBeneficiary(request: CreateBeneficiaryRequest): Promise<Beneficiary>
  executeTransfer(request: TransferRequest): Promise<TransferReceipt>
  transfer(id: string, signal?: AbortSignal): Promise<TransferReceipt>
  reset(signal?: AbortSignal): Promise<void>
}
