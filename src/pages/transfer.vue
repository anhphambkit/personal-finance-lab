<script setup lang="ts">
definePageMeta({ title: 'Transfer' })
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
import type { TransferDetails } from '@/features/transfers/transferDraft'
import type { TransferDraft } from '@/features/transfers/transferDraft'
import type { TransferReceipt as Receipt } from '@/contracts/transfers'
import { transferFailure, idempotencyConflictFailure } from '@/features/transfers/transferFailure'
import DataState from '@/shared/components/DataState.vue'
const storageError = ref('')
const recovered = ref(false)
const uncertain = ref(false)
const conflict = ref(false)
const detailsDraft = ref<TransferDetails>()
const detailsVersion = ref(0)
let storageKey = ''
let resetGeneration = ''
const accounts = useAccounts()
const beneficiaries = useBeneficiaries()
const mutation = useTransfer()
const draft = ref<TransferDraft>()
const receipt = ref<Receipt>()
const stage = ref<'DETAILS' | 'REVIEW' | 'COMPLETE'>('DETAILS')
const stages = ['DETAILS', 'REVIEW', 'COMPLETE'] as const
const stageIndex = computed(() => stages.indexOf(stage.value))
const failure = computed(() =>
  mutation.error.value
    ? transferFailure(mutation.error.value)
    : conflict.value
      ? idempotencyConflictFailure
      : uncertain.value && !mutation.isPending.value
        ? {
            uncertain: true,
            message:
              'A previous confirmation may have completed. Retry the same transfer to retrieve its outcome without sending twice.',
          }
        : undefined,
)
const heading = ref<HTMLElement>()
let submitting = false
const waitingToConfirm = ref(false)
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
function changed(value: TransferDetails) {
  detailsDraft.value = value
  persist(() => saveDetails(storageKey, value))
}
onMounted(() => {
  const stop = watch(
    () => accounts.data.value,
    (items) => {
      const owner = items?.[0]?.ownerId
      if (!owner || storageKey) return
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
        if (saved.stage === 'DETAILS') detailsDraft.value = saved.details
        else {
          draft.value = saved.draft
          stage.value = 'REVIEW'
          uncertain.value = saved.submitted
          conflict.value = saved.conflict === true
        }
      })
    },
    { immediate: true },
  )
  stopRecoveryWatch = stop
})
let stopRecoveryWatch: (() => void) | undefined
onBeforeUnmount(() => stopRecoveryWatch?.())
function review(value: TransferDraft) {
  if (!persist(() => saveReview(storageKey, value, false))) return
  uncertain.value = false
  conflict.value = false
  draft.value = value
  mutation.reset()
  stage.value = 'REVIEW'
  void focusStage()
}
function back() {
  if (submitting || waitingToConfirm.value || failure.value?.uncertain) return
  if (!persist(() => clearRecovery(storageKey, draft.value?.request.idempotencyKey))) return
  detailsDraft.value = draft.value?.details
  if (detailsDraft.value) persist(() => saveDetails(storageKey, detailsDraft.value!))
  mutation.reset()
  conflict.value = false
  stage.value = 'DETAILS'
  void focusStage()
}
function another() {
  if (!persist(() => clearRecovery(storageKey, draft.value?.request.idempotencyKey))) return
  detailsDraft.value = undefined
  recovered.value = false
  uncertain.value = false
  draft.value = undefined
  receipt.value = undefined
  mutation.reset()
  stage.value = 'DETAILS'
  void focusStage()
}
async function confirm() {
  if (waitingToConfirm.value || submitting || stage.value !== 'REVIEW') return
  waitingToConfirm.value = true
  try {
    if (navigator.locks)
      await navigator.locks.request(
        'raksul-transfer-confirm',
        { mode: 'exclusive' },
        performConfirm,
      )
    else await performConfirm()
  } finally {
    waitingToConfirm.value = false
  }
}
async function performConfirm() {
  if (submitting || stage.value !== 'REVIEW' || !draft.value || failure.value?.conflict) return
  if (!persist(() => saveReview(storageKey, draft.value!, true))) return
  uncertain.value = true
  submitting = true
  try {
    const request = draft.value.request
    const result = await mutation.mutateAsync(request)
    if (draft.value?.request.idempotencyKey !== request.idempotencyKey) return
    receipt.value = result
    persist(() => clearRecovery(storageKey, draft.value?.request.idempotencyKey))
    uncertain.value = false
    stage.value = 'COMPLETE'
    void focusStage()
  } catch {
    if (draft.value && mutation.error.value && !transferFailure(mutation.error.value).uncertain) {
      uncertain.value = false
      conflict.value = transferFailure(mutation.error.value).conflict === true
      persist(() => saveReview(storageKey, draft.value!, false, conflict.value))
    }
  } finally {
    submitting = false
  }
}
function preventUncertainLeave(event: BeforeUnloadEvent) {
  if (submitting || waitingToConfirm.value || failure.value?.uncertain) {
    event.preventDefault()
    event.returnValue = ''
  }
}
function resetDraft() {
  conflict.value = false
  detailsVersion.value++
  try {
    resetGeneration = localStorage.getItem(DEMO_RESET_KEY) ?? ''
  } catch {
    /* Confirmation will remain blocked by storage checks. */
  }
  draft.value = undefined
  detailsDraft.value = undefined
  receipt.value = undefined
  recovered.value = false
  uncertain.value = false
  storageError.value = ''
  mutation.reset()
  stage.value = 'DETAILS'
}
onMounted(() => {
  window.addEventListener('beforeunload', preventUncertainLeave)
  window.addEventListener(BANKING_RESET_EVENT, resetDraft)
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', preventUncertainLeave)
  window.removeEventListener(BANKING_RESET_EVENT, resetDraft)
})
onBeforeRouteLeave(() => !(submitting || waitingToConfirm.value || failure.value?.uncertain))
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
        :pending="mutation.isPending.value || waitingToConfirm"
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
