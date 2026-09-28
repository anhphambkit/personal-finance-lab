import { z } from 'zod'
import type { TransferRequest } from '../../contracts/transfers'
import { beneficiaryRequestSchema } from './beneficiaryRequestSchema'

const id = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value === value.trim())
export const transferRequestSchema = z.strictObject({
  idempotencyKey: id,
  sourceAccountId: id,
  destination: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('OWN_ACCOUNT'), accountId: id }),
    z.strictObject({ kind: z.literal('BENEFICIARY'), beneficiaryId: id }),
    z.strictObject({
      kind: z.literal('NEW_BENEFICIARY'),
      beneficiary: beneficiaryRequestSchema,
      saveRecipient: z.boolean().optional(),
    }),
  ]),
  amountMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  currency: z.literal('USD'),
  reference: z.string().max(140).optional(),
}) satisfies z.ZodType<TransferRequest>
