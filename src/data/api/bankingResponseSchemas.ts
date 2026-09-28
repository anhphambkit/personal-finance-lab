import { z } from 'zod'

const identifier = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value)
const label = z.string().trim().min(1)
const accountNumber = z.string().regex(/^\d{8,20}$/)
const nonnegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const positiveInteger = nonnegativeInteger.min(1)
const currency = z.literal('USD')
const timestamp = z.iso.datetime({ offset: true })

// Strip unknown properties: only the public contract enters application state.
export const customerResponseSchema = z.object({
  id: identifier,
  firstName: label,
  lastName: label,
  displayName: label,
})
export const accountResponseSchema = z.object({
  id: identifier,
  ownerId: identifier,
  displayName: label,
  type: z.enum(['CHECKING', 'SAVINGS']),
  accountNumber,
  currency,
  balanceMinor: nonnegativeInteger,
  status: z.enum(['ACTIVE', 'FROZEN']),
  createdAt: timestamp,
})
export const accountsResponseSchema = z.array(accountResponseSchema)
export const recipientResponseSchema = z.object({
  displayName: label,
  bankName: label,
  accountNumber,
  currency,
})
export const beneficiaryResponseSchema = recipientResponseSchema.extend({
  id: identifier,
  customerId: identifier,
  internalAccountId: identifier.optional(),
})
export const beneficiariesResponseSchema = z.array(beneficiaryResponseSchema)
export const transactionResponseSchema = z.object({
  id: identifier,
  accountId: identifier,
  transferId: identifier.optional(),
  direction: z.enum(['DEBIT', 'CREDIT']),
  type: z.enum(['TRANSFER', 'CARD', 'CASH', 'FEE', 'INTEREST']),
  amountMinor: positiveInteger,
  currency,
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED']),
  description: z.string(),
  counterparty: z.string().optional(),
  occurredAt: timestamp,
})
export const transactionsResponseSchema = z
  .object({
    data: z.array(transactionResponseSchema),
    pagination: z.object({
      page: positiveInteger,
      pageSize: positiveInteger.max(100),
      totalItems: nonnegativeInteger,
      totalPages: nonnegativeInteger,
    }),
  })
  .refine(
    ({ data, pagination }) =>
      data.length <= pagination.pageSize &&
      data.length <= pagination.totalItems &&
      pagination.totalPages === Math.ceil(pagination.totalItems / pagination.pageSize),
  )
const recipientSnapshot = z.object({ name: label, bankName: label, accountNumber })
export const transferReceiptResponseSchema = z.object({
  id: identifier,
  sourceAccountId: identifier,
  destination: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('OWN_ACCOUNT'), accountId: identifier }),
    z.object({ kind: z.literal('INTERNAL_ACCOUNT'), accountId: identifier, recipientSnapshot }),
    z.object({ kind: z.literal('EXTERNAL_ACCOUNT'), recipientSnapshot }),
  ]),
  amountMinor: positiveInteger,
  currency,
  reference: z.string().optional(),
  status: z.literal('COMPLETED'),
  createdAt: timestamp,
  completedAt: timestamp,
})
export const resetResponseSchema = z.undefined()
