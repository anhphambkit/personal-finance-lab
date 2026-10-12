<script setup lang="ts">
definePageMeta({ title: 'Transfer' })
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useAccounts } from '@/features/accounts/composables/useAccounts'
import { useBeneficiaries } from '@/features/transfers/composables/useBeneficiaries'
import { useTransfer } from '@/features/transfers/composables/useTransfer'
import TransferDetailsForm from '@/features/transfers/components/TransferDetailsForm.vue'
import TransferReview from '@/features/transfers/components/TransferReview.vue'
import TransferReceipt from '@/features/transfers/components/TransferReceipt.vue'
import {
  clearRecovery,
  readRecovery,
  recoveryKey,
  saveDetails,
  saveReview,
} from '@/features/transfers/transferRecovery'
import { BANKING_RESET_EVENT, DEMO_RESET_KEY } from '@/data/sync/bankingChanges'
import type { TransferDetails, TransferDraft } from '@/features/transfers/transferDraft'
import type { TransferReceipt as Receipt } from '@/contracts/transfers'
import {
  idempotencyConflictFailure,
  transferFailure,
  type TransferFailure,
} from '@/features/transfers/transferFailure'
import DataState from '@/shared/components/DataState.vue'

/** The whole transfer flow is one state; every step below is a transition between kinds. */
type Flow =
  | { kind: 'details' }
  | { kind: 'review'; draft: TransferDraft; failure?: TransferFailure }
  | { kind: 'sending'; draft: TransferDraft }
  | { kind: 'uncertain'; draft: TransferDraft; failure: TransferFailure }
  | { kind: 'conflict'; draft: TransferDraft }
  | { kind: 'complete'; draft: TransferDraft; receipt: Receipt }

const recoveredFailure: TransferFailure = {
  uncertain: true,
  message:
    'A previous confirmation may have completed. Retry the same transfer to retrieve its outcome without sending twice.',
}

const accounts = useAccounts()
const beneficiaries = useBeneficiaries()
const mutation = useTransfer()
const flow = shallowRef<Flow>({ kind: 'details' })
const detailsDraft = ref<TransferDetails>()
// The form copies `initial` once; bump the key to remount it with a restored draft.
const detailsVersion = ref(0)
const recovered = ref(false)
const storageError = ref('')
const heading = ref<HTMLElement>()
let storageKey = ''
let resetGeneration = ''

const stages = ['DETAILS', 'REVIEW', 'COMPLETE'] as const
const stage = computed(() =>
  flow.value.kind === 'details'
    ? 'DETAILS'
    : flow.value.kind === 'complete'
      ? 'COMPLETE'
      : 'REVIEW',
)
const stageIndex = computed(() => stages.indexOf(stage.value))
const draft = computed(() => (flow.value.kind === 'details' ? undefined : flow.value.draft))
const receipt = computed(() => (flow.value.kind === 'complete' ? flow.value.receipt : undefined))
const failure = computed(() => {
  const current = flow.value
  if (current.kind === 'conflict') return idempotencyConflictFailure
  if (current.kind === 'review' || current.kind === 'uncertain') return current.failure
  return undefined
})
const sending = computed(() => flow.value.kind === 'sending')
// Leaving now could lose the only record of a payment that may have moved money.
const mustStay = computed(() => flow.value.kind === 'sending' || flow.value.kind === 'uncertain')

function retry() {
  void accounts.refetch()
  void beneficiaries.refetch()
}
async function focusStage() {
  await nextTick()
  heading.value?.focus()
}
function persist(action: () => void) {
  try {
    if (!storageKey) throw new Error('Transfer recovery storage is not ready.')
    if ((localStorage.getItem(DEMO_RESET_KEY) ?? '') !== resetGeneration)
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

function restore(owner: string) {
  storageKey = recoveryKey(owner)
  try {
    resetGeneration = localStorage.getItem(DEMO_RESET_KEY) ?? ''
  } catch {
    storageError.value = 'Transfer recovery storage is unavailable.'
    return
  }
  persist(() => {
    const saved = readRecovery(storageKey)
    if (!saved) return
    recovered.value = true
    if (saved.stage === 'DETAILS') {
      detailsDraft.value = saved.details
      // With warm account data the form is already mounted with empty values.
      detailsVersion.value++
    } else if (saved.conflict) flow.value = { kind: 'conflict', draft: saved.draft }
    else if (saved.submitted)
      flow.value = { kind: 'uncertain', draft: saved.draft, failure: recoveredFailure }
    else flow.value = { kind: 'review', draft: saved.draft }
  })
}

function changed(value: TransferDetails) {
  if (flow.value.kind !== 'details') return
  detailsDraft.value = value
  persist(() => saveDetails(storageKey, value))
}
function review(value: TransferDraft) {
  if (flow.value.kind !== 'details') return
  if (!persist(() => saveReview(storageKey, value, false))) return
  flow.value = { kind: 'review', draft: value }
  void focusStage()
}
function back() {
  const current = flow.value
  if (current.kind !== 'review' && current.kind !== 'conflict') return
  const details = current.draft.details
  const saved = persist(() => {
    clearRecovery(storageKey, current.draft.request.idempotencyKey)
    saveDetails(storageKey, details)
  })
  if (!saved) return
  detailsDraft.value = details
  flow.value = { kind: 'details' }
  void focusStage()
}
function another() {
  const current = flow.value
  if (current.kind !== 'complete') return
  if (!persist(() => clearRecovery(storageKey, current.draft.request.idempotencyKey))) return
  detailsDraft.value = undefined
  recovered.value = false
  flow.value = { kind: 'details' }
  void focusStage()
}

async function confirm() {
  const previous = flow.value
  if (previous.kind !== 'review' && previous.kind !== 'uncertain') return
  const payment = previous.draft
  flow.value = { kind: 'sending', draft: payment }
  // One confirmation at a time across tabs.
  if (navigator.locks)
    await navigator.locks.request('raksul-transfer-confirm', { mode: 'exclusive' }, () =>
      send(payment, previous),
    )
  else await send(payment, previous)
}
async function send(payment: TransferDraft, previous: Flow) {
  // A reset in another tab may have replaced this flow while waiting for the lock.
  const isCurrent = () => flow.value.kind === 'sending' && flow.value.draft === payment
  if (!isCurrent()) return
  // Record the attempt first, so a lost response can be retried with the same key.
  if (!persist(() => saveReview(storageKey, payment, true))) {
    flow.value = previous
    return
  }
  try {
    const result = await mutation.mutateAsync(payment.request)
    if (!isCurrent()) return
    persist(() => clearRecovery(storageKey, payment.request.idempotencyKey))
    flow.value = { kind: 'complete', draft: payment, receipt: result }
    void focusStage()
  } catch (error) {
    if (!isCurrent()) return
    const outcome = transferFailure(error)
    if (outcome.uncertain) {
      flow.value = { kind: 'uncertain', draft: payment, failure: outcome }
      return
    }
    flow.value = outcome.conflict
      ? { kind: 'conflict', draft: payment }
      : { kind: 'review', draft: payment, failure: outcome }
    persist(() => saveReview(storageKey, payment, false, outcome.conflict === true))
  }
}

function resetDraft() {
  try {
    resetGeneration = localStorage.getItem(DEMO_RESET_KEY) ?? ''
  } catch {
    /* Confirmation will remain blocked by storage checks. */
  }
  detailsDraft.value = undefined
  detailsVersion.value++
  recovered.value = false
  storageError.value = ''
  flow.value = { kind: 'details' }
}
function preventLeave(event: BeforeUnloadEvent) {
  if (!mustStay.value) return
  event.preventDefault()
  event.returnValue = ''
}

let stopRestore: (() => void) | undefined
onMounted(() => {
  stopRestore = watch(
    () => accounts.data.value?.[0]?.ownerId,
    (owner) => {
      if (!owner || storageKey) return
      restore(owner)
      stopRestore?.()
    },
    { immediate: true },
  )
  window.addEventListener('beforeunload', preventLeave)
  window.addEventListener(BANKING_RESET_EVENT, resetDraft)
})
onBeforeUnmount(() => {
  stopRestore?.()
  window.removeEventListener('beforeunload', preventLeave)
  window.removeEventListener(BANKING_RESET_EVENT, resetDraft)
})
onBeforeRouteLeave(() => !mustStay.value)
</script>
<template>
  <section aria-labelledby="transfer-title" class="min-w-0 space-y-5 py-2 sm:py-3">
    <header class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div class="mb-1 flex items-center gap-2">
          <p class="text-xs font-semibold tracking-[0.16em] text-primary">MOVE MONEY</p>
          <span
            v-if="recovered"
            role="status"
            class="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
          >
            Draft restored
          </span>
        </div>
        <h1
          id="transfer-title"
          ref="heading"
          tabindex="-1"
          class="text-2xl font-semibold tracking-tight text-highlighted focus:outline-none sm:text-3xl"
        >
          {{ stage === 'COMPLETE' ? 'All done' : 'Make a transfer' }}
        </h1>
        <p class="mt-1 hidden text-sm text-muted sm:block">Fast, secure and easy to review.</p>
      </div>
      <ol
        aria-label="Transfer progress"
        class="grid w-full grid-cols-3 gap-1 rounded-2xl border border-default bg-default p-1.5 shadow-sm lg:max-w-md"
      >
        <li
          v-for="(item, index) in stages"
          :key="item"
          :aria-current="stage === item ? 'step' : undefined"
          class="flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2 text-sm transition-colors"
          :class="
            stage === item
              ? 'bg-primary font-semibold text-white shadow-sm'
              : index < stageIndex
                ? 'font-medium text-success'
                : 'text-muted'
          "
        >
          <span
            class="flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            :class="
              stage === item ? 'bg-white/20' : index < stageIndex ? 'bg-success/10' : 'bg-elevated'
            "
          >
            {{ index < stageIndex ? '✓' : index + 1 }}
          </span>
          <span class="truncate">{{ ['Details', 'Review', 'Done'][index] }}</span>
        </li>
      </ol>
    </header>
    <p v-if="storageError" role="alert" class="text-error">{{ storageError }}</p>
    <div
      class="bank-transfer-shell min-w-0 overflow-hidden rounded-3xl border border-default bg-default p-4 sm:p-6"
    >
      <TransferReceipt
        v-if="stage === 'COMPLETE' && receipt && draft"
        :receipt="receipt"
        :recipient="
          receipt.destination.kind === 'OWN_ACCOUNT'
            ? draft.recipient
            : receipt.destination.recipientSnapshot
        "
        @another="another"
      />
      <TransferReview
        v-else-if="stage === 'REVIEW' && draft"
        :draft="draft"
        :pending="sending"
        :failure="failure"
        @back="back"
        @confirm="confirm"
      />
      <DataState
        v-else
        :loading="
          !accounts.isError.value &&
          !beneficiaries.isError.value &&
          (!accounts.data.value || !beneficiaries.data.value)
        "
        :error="accounts.error.value || beneficiaries.error.value"
        :empty="accounts.data.value?.length === 0"
        label="transfer details"
        empty-message="An active account is needed to make a transfer."
        @retry="retry"
      >
        <TransferDetailsForm
          v-if="accounts.data.value && beneficiaries.data.value"
          :key="detailsVersion"
          :accounts="accounts.data.value"
          :beneficiaries="beneficiaries.data.value"
          :initial="detailsDraft ?? draft?.details"
          demo-defaults
          @change="changed"
          @review="review"
        />
      </DataState>
    </div>
  </section>
</template>
