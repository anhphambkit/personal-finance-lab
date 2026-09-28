import { describe, it, expect, vi } from 'vitest'
import { prepareTransfer } from '../../features/transfers/transferDraft'
import {
  readRecovery,
  saveReview,
  saveDetails,
  clearRecovery,
  clearRecoveryForIdentity,
  recoveryKey,
  RECOVERY_DRAFT_TTL_MS,
} from '../../features/transfers/transferRecovery'
import { createSeedState } from '../../data/seed/createSeedState'
const seed = createSeedState()
const details = {
  sourceAccountId: 'account-checking',
  recipientType: 'OWN_ACCOUNT' as const,
  destinationId: 'account-savings',
  recipientNetwork: 'SAME_BANK' as const,
  recipientAccountId: '',
  recipientName: '',
  bankName: '',
  amount: '10.50',
  reference: 'Recover me',
}
describe('durable transfer recovery', () => {
  it('retains the exact key and request and prevents another draft from replacing an uncertain request', () => {
    const draft = prepareTransfer(details, seed.accounts, seed.beneficiaries)
    saveReview('recovery-test', draft, true)
    expect(readRecovery('recovery-test')).toEqual({ stage: 'REVIEW', draft, submitted: true })
    expect(() => saveDetails('recovery-test', details)).toThrow('unresolved transfer')
    expect(() =>
      saveReview(
        'recovery-test',
        prepareTransfer(details, seed.accounts, seed.beneficiaries),
        false,
      ),
    ).toThrow('unresolved transfer')
    clearRecovery('recovery-test', 'wrong-key')
    expect(readRecovery('recovery-test')).toBeDefined()
    clearRecovery('recovery-test', draft.request.idempotencyKey)
    expect(readRecovery('recovery-test')).toBeUndefined()
  })
  it('surfaces unavailable and corrupt storage instead of silently discarding pending work', () => {
    localStorage.setItem('recovery-test', '{')
    expect(() => readRecovery('recovery-test')).toThrow()
    localStorage.clear()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage full')
    })
    expect(() => saveDetails('recovery-test', details)).toThrow('Storage full')
  })
  it('expires disposable drafts without extending retention on reads', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    saveDetails('recovery-test', details)
    vi.mocked(Date.now).mockReturnValue(1000 + RECOVERY_DRAFT_TTL_MS - 1)
    expect(readRecovery('recovery-test')).toEqual({ stage: 'DETAILS', details })
    vi.mocked(Date.now).mockReturnValue(1000 + RECOVERY_DRAFT_TTL_MS)
    expect(readRecovery('recovery-test')).toBeUndefined()
    expect(localStorage.getItem('recovery-test')).toBeNull()
  })
  it('expires an unsubmitted review but retains submitted and terminal-conflict guards', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    const draft = prepareTransfer(details, seed.accounts, seed.beneficiaries)
    saveReview('disposable', draft, false)
    saveReview('submitted', draft, true)
    saveReview('conflict', draft, false, true)
    vi.mocked(Date.now).mockReturnValue(1000 + RECOVERY_DRAFT_TTL_MS * 2)
    expect(readRecovery('disposable')).toBeUndefined()
    expect(readRecovery('submitted')).toEqual({ stage: 'REVIEW', draft, submitted: true })
    expect(readRecovery('conflict')).toEqual({
      stage: 'REVIEW',
      draft,
      submitted: false,
      conflict: true,
    })
    expect(() => saveDetails('submitted', details)).toThrow('unresolved transfer')
  })
  it('migrates legacy records once and rejects unknown or malformed versions', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    localStorage.setItem('legacy', JSON.stringify({ stage: 'DETAILS', details }))
    expect(readRecovery('legacy')).toEqual({ stage: 'DETAILS', details })
    expect(JSON.parse(localStorage.getItem('legacy')!)).toMatchObject({
      version: 2,
      updatedAt: 1000,
    })
    vi.mocked(Date.now).mockReturnValue(1000 + RECOVERY_DRAFT_TTL_MS)
    expect(readRecovery('legacy')).toBeUndefined()
    for (const invalid of [
      { version: 3, stage: 'DETAILS', details },
      { version: 2, updatedAt: 'invalid', record: { stage: 'DETAILS', details } },
    ]) {
      localStorage.setItem('corrupt', JSON.stringify(invalid))
      expect(() => readRecovery('corrupt')).toThrow('could not be read')
      expect(localStorage.getItem('corrupt')).not.toBeNull()
    }
  })
  it('cleans only the ended identity and mode, retaining same-key uncertain recovery', () => {
    const draft = prepareTransfer(details, seed.accounts, seed.beneficiaries)
    saveDetails(recoveryKey('a', false), details)
    saveDetails(recoveryKey('a', true), details)
    saveReview(recoveryKey('b', false), draft, true)
    expect(clearRecoveryForIdentity('a', false)).toBe('cleared')
    expect(readRecovery(recoveryKey('a', false))).toBeUndefined()
    expect(readRecovery(recoveryKey('a', true))).toBeDefined()
    expect(clearRecoveryForIdentity('b', false)).toBe('retained')
    expect(readRecovery(recoveryKey('b', false))).toEqual({
      stage: 'REVIEW',
      draft,
      submitted: true,
    })
  })
  it('preserves a legacy submitted request beyond the retention window', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    const draft = prepareTransfer(details, seed.accounts, seed.beneficiaries)
    localStorage.setItem('legacy', JSON.stringify({ stage: 'REVIEW', draft, submitted: true }))
    expect(readRecovery('legacy')).toEqual({ stage: 'REVIEW', draft, submitted: true })
    vi.mocked(Date.now).mockReturnValue(1000 + RECOVERY_DRAFT_TTL_MS * 2)
    expect(readRecovery('legacy')).toEqual({ stage: 'REVIEW', draft, submitted: true })
  })
})
