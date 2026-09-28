import { z } from 'zod'
import type { BankingState } from '../../use-cases/ports/BankingRepository'

export type PersistedBankingState = BankingState & { schemaVersion: 1 }

const text = z.string().refine((value) => value.trim().length > 0)
const timestamp = z.iso.datetime()
const currency = z.literal('USD')
const balance = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const amount = balance.min(1)
const recipient = z.strictObject({ name: text, bankName: text, accountNumber: text })

export const persistedBankingStateSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    customer: z.strictObject({ id: text, firstName: text, lastName: text, displayName: text }),
    accounts: z.array(
      z.strictObject({
        id: text,
        ownerId: text,
        displayName: text,
        type: z.enum(['CHECKING', 'SAVINGS']),
        accountNumber: text,
        currency,
        balanceMinor: balance,
        status: z.enum(['ACTIVE', 'FROZEN']),
        createdAt: timestamp,
      }),
    ),
    transactions: z.array(
      z.strictObject({
        id: text,
        accountId: text,
        transferId: text.optional(),
        direction: z.enum(['DEBIT', 'CREDIT']),
        type: z.enum(['TRANSFER', 'CARD', 'CASH', 'FEE', 'INTEREST']),
        amountMinor: amount,
        currency,
        status: z.enum(['PENDING', 'COMPLETED', 'FAILED']),
        description: text,
        counterparty: text.optional(),
        occurredAt: timestamp,
      }),
    ),
    transfers: z.array(
      z.strictObject({
        id: text,
        idempotencyKey: text,
        requestHash: text,
        sourceAccountId: text,
        destination: z.discriminatedUnion('kind', [
          z.strictObject({ kind: z.literal('OWN_ACCOUNT'), accountId: text }),
          z.strictObject({
            kind: z.literal('INTERNAL_ACCOUNT'),
            accountId: text,
            recipientSnapshot: recipient,
          }),
          z.strictObject({ kind: z.literal('EXTERNAL_ACCOUNT'), recipientSnapshot: recipient }),
        ]),
        amountMinor: amount,
        currency,
        reference: text.optional(),
        status: z.literal('COMPLETED'),
        createdAt: timestamp,
        completedAt: timestamp,
      }),
    ),
    beneficiaries: z.array(
      z.strictObject({
        id: text,
        customerId: text,
        displayName: text,
        bankName: text,
        accountNumber: text,
        currency,
        internalAccountId: text.optional(),
      }),
    ),
  })
  .superRefine((state, ctx) => {
    const invalid = (message: string) => ctx.addIssue({ code: 'custom', message })
    for (const records of [
      state.accounts,
      state.transactions,
      state.transfers,
      state.beneficiaries,
    ]) {
      if (new Set(records.map((record) => record.id)).size !== records.length)
        invalid('Duplicate entity ID.')
    }
    if (
      new Set(state.accounts.map((account) => account.accountNumber)).size !== state.accounts.length
    ) {
      invalid('Duplicate account number.')
    }
    const accounts = new Map(state.accounts.map((account) => [account.id, account]))
    const transfers = new Map(state.transfers.map((transfer) => [transfer.id, transfer]))
    if (!state.accounts.some((account) => account.ownerId === state.customer.id))
      invalid('Customer has no accounts.')
    if (
      new Set(state.transfers.map((transfer) => transfer.idempotencyKey)).size !==
      state.transfers.length
    ) {
      invalid('Duplicate idempotency key.')
    }
    for (const entry of state.transactions) {
      if (!accounts.has(entry.accountId)) invalid('Activity references an unknown account.')
      if (entry.transferId && !transfers.has(entry.transferId))
        invalid('Activity references an unknown transfer.')
    }
    for (const beneficiary of state.beneficiaries) {
      if (beneficiary.customerId !== state.customer.id)
        invalid('Beneficiary belongs to another customer.')
      if (beneficiary.internalAccountId) {
        const target = accounts.get(beneficiary.internalAccountId)
        if (
          !target ||
          target.ownerId === state.customer.id ||
          target.accountNumber !== beneficiary.accountNumber
        ) {
          invalid('Invalid internal beneficiary account.')
        }
      }
    }
    for (const transfer of state.transfers) {
      const source = accounts.get(transfer.sourceAccountId)
      if (!source || source.ownerId !== state.customer.id) invalid('Invalid transfer source.')
      if (Date.parse(transfer.completedAt) < Date.parse(transfer.createdAt))
        invalid('Invalid transfer chronology.')
      const destination = transfer.destination
      if (destination.kind !== 'EXTERNAL_ACCOUNT') {
        const target = accounts.get(destination.accountId)
        if (
          !target ||
          target.id === transfer.sourceAccountId ||
          (destination.kind === 'OWN_ACCOUNT'
            ? target.ownerId !== state.customer.id
            : target.ownerId === state.customer.id)
        ) {
          invalid('Invalid transfer destination.')
        }
        if (
          destination.kind === 'INTERNAL_ACCOUNT' &&
          target?.accountNumber !== destination.recipientSnapshot.accountNumber
        ) {
          invalid('Internal recipient snapshot does not match.')
        }
      }
      const entries = state.transactions.filter((entry) => entry.transferId === transfer.id)
      const expectedCount = destination.kind === 'EXTERNAL_ACCOUNT' ? 1 : 2
      const debit = entries.filter(
        (entry) => entry.accountId === transfer.sourceAccountId && entry.direction === 'DEBIT',
      )
      const credit =
        destination.kind === 'EXTERNAL_ACCOUNT'
          ? []
          : entries.filter(
              (entry) => entry.accountId === destination.accountId && entry.direction === 'CREDIT',
            )
      if (
        entries.length !== expectedCount ||
        debit.length !== 1 ||
        credit.length !== expectedCount - 1 ||
        entries.some(
          (entry) =>
            entry.type !== 'TRANSFER' ||
            entry.status !== 'COMPLETED' ||
            entry.amountMinor !== transfer.amountMinor ||
            entry.occurredAt !== transfer.completedAt,
        )
      ) {
        invalid('Transfer activity is incomplete or inconsistent.')
      }
    }
  }) satisfies z.ZodType<PersistedBankingState>
