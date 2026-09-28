import type { CurrencyCode } from '../domain/money/currency'
import type { Transfer } from '../domain/transfers/transfer'
import type { CreateBeneficiaryRequest } from './beneficiaries'

export interface TransferRequest {
  idempotencyKey: string
  sourceAccountId: string
  destination:
    | { kind: 'OWN_ACCOUNT'; accountId: string }
    | { kind: 'BENEFICIARY'; beneficiaryId: string }
    | {
        kind: 'NEW_BENEFICIARY'
        beneficiary: CreateBeneficiaryRequest
        /** Omitted only by legacy clients/recovery records, which saved by default. */
        saveRecipient?: boolean
      }
  amountMinor: number
  currency: CurrencyCode
  reference?: string
}

export type TransferReceipt = Omit<Transfer, 'idempotencyKey' | 'requestHash'>
