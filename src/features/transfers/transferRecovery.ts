import { z } from 'zod'
import type { TransferDraft, TransferDetails } from './transferDraft'
import { transferRequestSchema } from '@/data/api/transferRequestSchema'

import { RECOVERY_PREFIX } from '@/data/sync/bankingChanges'
const detailsSchema = z.object({
  sourceAccountId: z.string(),
  recipientType: z.enum(['OWN_ACCOUNT', 'BENEFICIARY']),
  destinationId: z.string(),
  recipientNetwork: z.enum(['SAME_BANK', 'OTHER_BANK']).default('SAME_BANK'),
  recipientAccountId: z.string().default(''),
  recipientName: z.string().default(''),
  bankName: z.string().default(''),
  amount: z.string(),
  reference: z.string().max(140),
  savedBeneficiaryId: z.string().optional(),
  saveRecipient: z.boolean().optional(),
  verifiedAccountNumber: z.string().optional(),
})
const draftSchema = z.object({
  request: transferRequestSchema,
  details: detailsSchema,
  source: z.object({
    id: z.string(),
    ownerId: z.string(),
    displayName: z.string(),
    type: z.enum(['CHECKING', 'SAVINGS']),
    accountNumber: z.string(),
    currency: z.literal('USD'),
    balanceMinor: z.number().int().nonnegative().safe(),
    status: z.enum(['ACTIVE', 'FROZEN']),
    createdAt: z.string(),
  }),
  recipient: z.object({ name: z.string(), bankName: z.string(), accountNumber: z.string() }),
})
const recoverySchema = z.discriminatedUnion('stage', [
  z.object({ stage: z.literal('DETAILS'), details: detailsSchema }),
  z.object({
    stage: z.literal('REVIEW'),
    draft: draftSchema,
    submitted: z.boolean(),
    conflict: z.boolean().optional(),
  }),
])
export type RecoveryRecord = z.infer<typeof recoverySchema>
export function recoveryKey(owner: string) {
  return `${RECOVERY_PREFIX}demo:${owner}`
}
export function readRecovery(key: string): RecoveryRecord | undefined {
  const raw = localStorage.getItem(key)
  if (!raw) return
  const parsed = recoverySchema.safeParse(JSON.parse(raw))
  if (!parsed.success)
    throw new Error(
      'Saved transfer data could not be read. Do not submit a replacement until the earlier outcome is checked.',
    )
  return parsed.data
}
export function saveRecovery(key: string, record: RecoveryRecord) {
  const previous = readRecovery(key)
  if (
    previous?.stage === 'REVIEW' &&
    previous.submitted &&
    (record.stage !== 'REVIEW' ||
      record.draft.request.idempotencyKey !== previous.draft.request.idempotencyKey)
  )
    throw new Error(
      'Another tab has an unresolved transfer. Reload to recover it before starting a new transfer.',
    )
  localStorage.setItem(key, JSON.stringify(record))
}
export function saveDetails(key: string, details: TransferDetails) {
  saveRecovery(key, { stage: 'DETAILS', details })
}
export function saveReview(
  key: string,
  draft: TransferDraft,
  submitted: boolean,
  conflict = false,
) {
  saveRecovery(key, { stage: 'REVIEW', draft, submitted, ...(conflict ? { conflict: true } : {}) })
}
export function clearRecovery(key: string, requestKey?: string) {
  const record = readRecovery(key)
  if (
    record?.stage === 'REVIEW' &&
    record.submitted &&
    record.draft.request.idempotencyKey !== requestKey
  )
    return
  localStorage.removeItem(key)
}
