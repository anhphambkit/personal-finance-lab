<script setup lang="ts">
definePageMeta({ title: 'Transfer' })
import { computed, nextTick, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useAccounts } from '@/features/accounts/composables/useAccounts'
import { useBeneficiaries } from '@/features/transfers/composables/useBeneficiaries'
import { useTransferFlow } from '@/features/transfers/composables/useTransferFlow'
import TransferDetailsForm from '@/features/transfers/components/TransferDetailsForm.vue'
import TransferReview from '@/features/transfers/components/TransferReview.vue'
import TransferReceipt from '@/features/transfers/components/TransferReceipt.vue'
import { useBankingContext } from '@/data/api/bankingContext'
import DataState from '@/shared/components/DataState.vue'
const { mocksEnabled } = useBankingContext()
const accounts = useAccounts()
const beneficiaries = useBeneficiaries()
const heading = ref<HTMLElement>()
const {
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
} = useTransferFlow(() => {
  void nextTick(() => heading.value?.focus())
})
const stages = ['DETAILS', 'REVIEW', 'COMPLETE'] as const
const stageIndex = computed(() => stages.indexOf(stage.value))
function retry() {
  void accounts.refetch()
  void beneficiaries.refetch()
}
onBeforeRouteLeave(canLeave)
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
        :pending="pending"
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
          :demo-defaults="mocksEnabled"
          @change="changed"
          @review="review"
        />
      </DataState>
    </div>
  </section>
</template>
