import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useBankingContext } from '@/data/api/bankingContext'
import { BANKING_RESET_EVENT, DEMO_RESET_KEY } from '@/data/sync/bankingChanges'
import type { TransferReceipt } from '@/contracts/transfers'
import type { TransferDetails, TransferDraft } from '../transferDraft'
import {
  clearRecovery,
  readRecovery,
  recoveryKey,
  saveDetails,
  saveReview,
} from '../transferRecovery'
import { createDebouncedRecoverySave } from '../debouncedRecoverySave'
import {
  idempotencyConflictFailure,
  transferFailure,
  type TransferFailure,
} from '../transferFailure'
import { useTransfer } from './useTransfer'

type ReviewState =
  | { kind: 'review'; draft: TransferDraft; failure?: TransferFailure }
  | { kind: 'uncertain'; draft: TransferDraft; failure: TransferFailure }
  | { kind: 'conflict'; draft: TransferDraft; failure: TransferFailure }
export type TransferFlowState =
  | { kind: 'details'; details?: TransferDetails }
  | ReviewState
  | { kind: 'waiting'; previous: ReviewState; draft: TransferDraft }
  | { kind: 'submitting'; draft: TransferDraft }
  | { kind: 'complete'; draft: TransferDraft; receipt: TransferReceipt }

const recoveryFailure: TransferFailure = {
  uncertain: true,
  message:
    'A previous confirmation may have completed. Retry the same transfer to retrieve its outcome without sending twice.',
}

export function useTransferFlow(focusStage: () => void) {
  const { mocksEnabled, session, ready } = useBankingContext()
  const mutation = useTransfer()
  const state = shallowRef<TransferFlowState>({ kind: 'details' })
  const storageError = ref('')
  const recovered = ref(false)
  const detailsVersion = ref(0)
  let storageKey = ''
  let resetGeneration = ''
  let generation = 0
  let mounted = false
  const stage = computed(() =>
    state.value.kind === 'details'
      ? 'DETAILS'
      : state.value.kind === 'complete'
        ? 'COMPLETE'
        : 'REVIEW',
  )
  const draft = computed(() => ('draft' in state.value ? state.value.draft : undefined))
  const detailsDraft = computed(() =>
    state.value.kind === 'details' ? state.value.details : undefined,
  )
  const receipt = computed(() =>
    state.value.kind === 'complete' ? state.value.receipt : undefined,
  )
  const pending = computed(
    () => state.value.kind === 'waiting' || state.value.kind === 'submitting',
  )
  const failure = computed(() => ('failure' in state.value ? state.value.failure : undefined))
  const preventsLeave = computed(() => pending.value || state.value.kind === 'uncertain')

  function persist(action: () => void) {
    try {
      if (!storageKey || !ready.value || !session.userId.value)
        throw new Error('Transfer recovery storage is not ready.')
      if (mocksEnabled && (localStorage.getItem(DEMO_RESET_KEY) ?? '') !== resetGeneration)
        throw new Error('Demo data was reset in another tab. Reload before making a transfer.')
      action()
      storageError.value = ''
      return true
    } catch (error) {
      storageError.value =
        error instanceof Error
          ? error.message
          : 'Transfer recovery could not be saved. Nothing new was submitted.'
      return false
    }
  }
  const autosave = createDebouncedRecoverySave(() => {
    const current = state.value
    if (current.kind === 'details' && current.details)
      persist(() => saveDetails(storageKey, current.details!))
  })
  function changed(details: TransferDetails) {
    if (state.value.kind !== 'details' || !ready.value) return
    state.value = { kind: 'details', details }
    autosave.schedule()
  }
  function resetDraft() {
    generation++
    autosave.cancel()
    state.value = { kind: 'details' }
    detailsVersion.value++
    recovered.value = false
    storageError.value = ''
    mutation.reset()
    try {
      resetGeneration = localStorage.getItem(DEMO_RESET_KEY) ?? ''
    } catch {
      /* persist reports unavailable storage */
    }
  }
  function restore() {
    if (!mounted || !ready.value || !session.userId.value || storageKey) return
    storageKey = recoveryKey(session.userId.value, mocksEnabled)
    persist(() => {
      resetGeneration = localStorage.getItem(DEMO_RESET_KEY) ?? ''
      const saved = readRecovery(storageKey)
      if (!saved) return
      recovered.value = true
      if (saved.stage === 'DETAILS') {
        state.value = { kind: 'details', details: saved.details }
        // Warm query caches can mount the form before this mounted restoration.
        detailsVersion.value++
      } else if (saved.conflict)
        state.value = { kind: 'conflict', draft: saved.draft, failure: idempotencyConflictFailure }
      else if (saved.submitted)
        state.value = { kind: 'uncertain', draft: saved.draft, failure: recoveryFailure }
      else state.value = { kind: 'review', draft: saved.draft }
    })
  }
  watch(
    () => session.generation.value,
    () => {
      resetDraft()
      storageKey = ''
    },
    { flush: 'sync' },
  )
  watch([ready, session.userId, session.generation], restore)

  function review(value: TransferDraft) {
    if (state.value.kind !== 'details') return
    autosave.cancel()
    if (!persist(() => saveReview(storageKey, value, false))) return
    mutation.reset()
    state.value = { kind: 'review', draft: value }
    focusStage()
  }
  function back() {
    const current = state.value
    if (current.kind !== 'review' && current.kind !== 'conflict') return
    if (!persist(() => clearRecovery(storageKey, current.draft.request.idempotencyKey))) return
    const details = current.draft.details
    persist(() => saveDetails(storageKey, details))
    mutation.reset()
    state.value = { kind: 'details', details }
    focusStage()
  }
  function another() {
    if (state.value.kind !== 'complete') return
    const key = state.value.draft.request.idempotencyKey
    if (!persist(() => clearRecovery(storageKey, key))) return
    resetDraft()
    focusStage()
  }
  async function confirm() {
    const previous = state.value
    if (previous.kind !== 'review' && previous.kind !== 'uncertain') return
    const currentGeneration = generation
    const currentSession = session.generation.value
    const isCurrent = () =>
      currentGeneration === generation && currentSession === session.generation.value && ready.value
    state.value = { kind: 'waiting', previous, draft: previous.draft }
    const perform = async () => {
      if (!isCurrent() || state.value.kind !== 'waiting') return
      const currentDraft = previous.draft
      if (!persist(() => saveReview(storageKey, currentDraft, true))) {
        state.value = previous
        return
      }
      state.value = { kind: 'submitting', draft: currentDraft }
      try {
        const result = await mutation.mutateAsync(currentDraft.request)
        if (!isCurrent()) return
        persist(() => clearRecovery(storageKey, currentDraft.request.idempotencyKey))
        state.value = { kind: 'complete', draft: currentDraft, receipt: result }
        focusStage()
      } catch (error) {
        if (!isCurrent()) return
        const result = transferFailure(error)
        state.value = result.uncertain
          ? { kind: 'uncertain', draft: currentDraft, failure: result }
          : result.conflict
            ? { kind: 'conflict', draft: currentDraft, failure: result }
            : { kind: 'review', draft: currentDraft, failure: result }
        if (!result.uncertain)
          persist(() => saveReview(storageKey, currentDraft, false, result.conflict === true))
      }
    }
    try {
      if (navigator.locks)
        await navigator.locks.request(
          'personal-finance-lab-transfer-confirm',
          { mode: 'exclusive' },
          perform,
        )
      else await perform()
    } finally {
      if (isCurrent() && state.value.kind === 'waiting') state.value = previous
    }
  }
  function beforeUnload(event: BeforeUnloadEvent) {
    if (preventsLeave.value) {
      event.preventDefault()
      event.returnValue = ''
    } else autosave.flush()
  }
  function canLeave() {
    if (preventsLeave.value) return false
    autosave.flush()
    return true
  }
  onMounted(() => {
    mounted = true
    try {
      resetGeneration = localStorage.getItem(DEMO_RESET_KEY) ?? ''
    } catch {
      /* persist reports unavailable storage */
    }
    restore()
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener(BANKING_RESET_EVENT, resetDraft)
  })
  onBeforeUnmount(() => {
    autosave.flush()
    autosave.cancel()
    generation++
    window.removeEventListener('beforeunload', beforeUnload)
    window.removeEventListener(BANKING_RESET_EVENT, resetDraft)
  })
  return {
    state,
    stage,
    draft,
    detailsDraft,
    receipt,
    pending,
    failure,
    storageError,
    recovered,
    detailsVersion,
    changed,
    review,
    back,
    another,
    confirm,
    canLeave,
  }
}
