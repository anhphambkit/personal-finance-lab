import { z } from 'zod'
import type { TransferDraft, TransferDetails } from './transferDraft'
import { transferRequestSchema } from '@/data/api/transferRequestSchema'

import { RECOVERY_PREFIX } from '@/data/sync/bankingChanges'
type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
let installedStorage: RecoveryStorage | undefined

/** Install the authenticated, memory-backed storage before rendering transfer UI. */
export function setRecoveryStorage(storage?: RecoveryStorage) {
  installedStorage = storage
}
function recoveryStorage(): RecoveryStorage {
  return installedStorage ?? localStorage
}
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
export const RECOVERY_DRAFT_TTL_MS = 24 * 60 * 60 * 1000
const storedRecoverySchema = z.object({
  version: z.literal(2),
  updatedAt: z.number().int().nonnegative().safe(),
  record: recoverySchema,
})
function mustRetain(record: RecoveryRecord) {
  return record.stage === 'REVIEW' && (record.submitted || record.conflict === true)
}
function writeRecovery(key: string, record: RecoveryRecord) {
  recoveryStorage().setItem(key, JSON.stringify({ version: 2, updatedAt: Date.now(), record }))
}
export function recoveryKey(owner: string, demo: boolean) {
  return `${RECOVERY_PREFIX}${demo ? 'demo' : 'backend'}:${owner}`
}
export function readRecovery(key: string): RecoveryRecord | undefined {
  const raw = recoveryStorage().getItem(key)
  if (!raw) return
  const value: unknown = JSON.parse(raw)
  const stored = storedRecoverySchema.safeParse(value)
  if (stored.success) {
    if (
      !mustRetain(stored.data.record) &&
      Date.now() - stored.data.updatedAt >= RECOVERY_DRAFT_TTL_MS
    ) {
      recoveryStorage().removeItem(key)
      return
    }
    return stored.data.record
  }
  // Legacy records have no trustworthy age. Start their retention window once,
  // without discarding an unresolved request or accepting an unknown version.
  const parsed = recoverySchema.safeParse(value)
  const versioned = typeof value === 'object' && value !== null && 'version' in value
  if (!parsed.success || versioned)
    throw new Error(
      'Saved transfer data could not be read. Do not submit a replacement until the earlier outcome is checked.',
    )
  writeRecovery(key, parsed.data)
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
  writeRecovery(key, record)
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
  recoveryStorage().removeItem(key)
}

/** Clear disposable drafts when identity ends. Unresolved payments need server
 * reconciliation before their request/key can safely be removed. Their existing
 * review snapshot remains in owner/mode-scoped storage until that is available.
 */
export function clearRecoveryForIdentity(owner: string, demo: boolean): 'cleared' | 'retained' {
  const key = recoveryKey(owner, demo)
  const record = readRecovery(key)
  if (record && mustRetain(record)) return 'retained'
  recoveryStorage().removeItem(key)
  return 'cleared'
}
