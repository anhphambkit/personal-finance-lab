import type { TransferRequest } from '../../contracts/transfers'
import { DomainError } from '../../domain/errors'
import { creditBalance, debitBalance } from '../../domain/money/money'
import type { Transfer, TransferDestination } from '../../domain/transfers/transfer'
import { validateTransfer } from '../../domain/transfers/validateTransfer'
import { resolveBeneficiary, saveBeneficiary } from '../beneficiaries/createBeneficiary'
import type { BankingRepository } from '../ports/BankingRepository'

export class TransferError extends Error {
  constructor(
    readonly code: 'IDEMPOTENCY_CONFLICT' | 'INVALID_REQUEST' | 'TRANSFER_NOT_FOUND',
    message: string,
  ) {
    super(message)
    this.name = 'TransferError'
  }
}

/** All business checks use the latest snapshot inside the atomic update. */
export async function executeTransfer(
  repository: BankingRepository,
  input: TransferRequest,
): Promise<Transfer> {
  // Copy caller-owned input before the asynchronous fingerprint operation.
  const request = structuredClone(input)
  if (
    !request.idempotencyKey.trim() ||
    request.idempotencyKey.length > 128 ||
    (request.reference?.length ?? 0) > 140
  ) {
    throw new TransferError('INVALID_REQUEST', 'Check the transfer reference and request key.')
  }
  request.reference = request.reference?.trim() || undefined
  const canonical = JSON.stringify([
    request.sourceAccountId,
    request.destination.kind,
    request.destination.kind === 'OWN_ACCOUNT'
      ? request.destination.accountId
      : request.destination.kind === 'BENEFICIARY'
        ? request.destination.beneficiaryId
        : [
            request.destination.beneficiary.displayName.trim(),
            request.destination.beneficiary.bankName.trim().toLowerCase(),
            request.destination.beneficiary.accountNumber.trim(),
            request.destination.beneficiary.currency,
          ],
    request.amountMinor,
    request.currency,
    request.reference ?? '',
    // Preserve fingerprints of pre-existing saved-recipient requests.
    ...(request.destination.kind === 'NEW_BENEFICIARY' &&
    request.destination.saveRecipient === false
      ? ['DO_NOT_SAVE_RECIPIENT']
      : []),
  ])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  const requestHash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  const transferId = `transfer-${crypto.randomUUID()}`
  const beneficiaryId = `beneficiary-${crypto.randomUUID()}`
  let resultId = transferId
  const committed = await repository.update((state) => {
    const previous = state.transfers.find(
      (transfer) => transfer.idempotencyKey === request.idempotencyKey,
    )
    if (previous) {
      if (previous.requestHash !== requestHash) {
        throw new TransferError(
          'IDEMPOTENCY_CONFLICT',
          'This request key was already used for different transfer details.',
        )
      }
      resultId = previous.id
      return state
    }
    const source = state.accounts.find((account) => account.id === request.sourceAccountId)
    let destination: TransferDestination
    if (request.destination.kind === 'OWN_ACCOUNT') {
      destination = { ...request.destination }
    } else {
      const requestedBeneficiary = request.destination
      const beneficiary =
        requestedBeneficiary.kind === 'NEW_BENEFICIARY'
          ? (requestedBeneficiary.saveRecipient === false ? resolveBeneficiary : saveBeneficiary)(
              state,
              requestedBeneficiary.beneficiary,
              beneficiaryId,
            )
          : state.beneficiaries.find(
              (item) =>
                item.id === requestedBeneficiary.beneficiaryId &&
                item.customerId === state.customer.id,
            )
      if (!beneficiary) throw new DomainError('INVALID_RECIPIENT', 'Choose an available recipient.')
      if (beneficiary.currency !== request.currency)
        throw new DomainError('CURRENCY_MISMATCH', 'The recipient must use the transfer currency.')
      const recipientSnapshot = {
        name: beneficiary.displayName,
        bankName: beneficiary.bankName,
        accountNumber: beneficiary.accountNumber,
      }
      destination = beneficiary.internalAccountId
        ? { kind: 'INTERNAL_ACCOUNT', accountId: beneficiary.internalAccountId, recipientSnapshot }
        : { kind: 'EXTERNAL_ACCOUNT', recipientSnapshot }
    }
    const destinationId =
      destination.kind === 'EXTERNAL_ACCOUNT' ? undefined : destination.accountId
    const target = state.accounts.find((account) => account.id === destinationId)
    validateTransfer({
      customerId: state.customer.id,
      sourceAccount: source,
      destination,
      destinationAccount: target,
      amountMinor: request.amountMinor,
      currency: request.currency,
    })
    // Validation above guarantees the source exists and all arithmetic is safe.
    if (!source) throw new DomainError('SOURCE_NOT_FOUND', 'The source account was not found.')
    const completedAt = new Date().toISOString()
    const transfer: Transfer = {
      id: transferId,
      idempotencyKey: request.idempotencyKey,
      requestHash,
      sourceAccountId: source.id,
      destination,
      amountMinor: request.amountMinor,
      currency: request.currency,
      ...(request.reference ? { reference: request.reference } : {}),
      status: 'COMPLETED',
      createdAt: completedAt,
      completedAt,
    }
    source.balanceMinor = debitBalance(source.balanceMinor, request.amountMinor)
    if (target) target.balanceMinor = creditBalance(target.balanceMinor, request.amountMinor)
    const recipientName =
      destination.kind === 'OWN_ACCOUNT' ? target!.displayName : destination.recipientSnapshot.name
    const activity = {
      transferId,
      type: 'TRANSFER' as const,
      amountMinor: request.amountMinor,
      currency: request.currency,
      status: 'COMPLETED' as const,
      occurredAt: completedAt,
    }
    state.transactions.push({
      ...activity,
      id: `${transferId}-debit`,
      accountId: source.id,
      direction: 'DEBIT',
      description: request.reference ?? `Transfer to ${recipientName}`,
      counterparty: recipientName,
    })
    if (target)
      state.transactions.push({
        ...activity,
        id: `${transferId}-credit`,
        accountId: target.id,
        direction: 'CREDIT',
        description: request.reference ?? `Transfer from ${source.displayName}`,
        counterparty: source.displayName,
      })
    state.transfers.push(transfer)
    return state
  })
  // Return only after the repository confirms commit, including idempotent replay.
  return committed.transfers.find((transfer) => transfer.id === resultId)!
}

export async function getTransfer(repository: BankingRepository, id: string): Promise<Transfer> {
  const state = await repository.load()
  const ownedIds = new Set(
    state.accounts
      .filter((account) => account.ownerId === state.customer.id)
      .map((account) => account.id),
  )
  const transfer = state.transfers.find(
    (item) => item.id === id && ownedIds.has(item.sourceAccountId),
  )
  if (!transfer)
    throw new TransferError('TRANSFER_NOT_FOUND', 'The requested transfer was not found.')
  return transfer
}
