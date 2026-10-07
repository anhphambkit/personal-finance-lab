import { describe, it, expect, vi } from 'vitest'
import { prepareTransfer } from '../../features/transfers/transferDraft'
import {
  readRecovery,
  saveReview,
  saveDetails,
  clearRecovery,
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
})
