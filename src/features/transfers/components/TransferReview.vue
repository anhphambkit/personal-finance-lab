<script setup lang="ts">
import UButton from '@nuxt/ui/components/Button.vue'
import MoneyDisplay from '@/shared/components/MoneyDisplay.vue'
import MaskedAccountNumber from '@/shared/components/MaskedAccountNumber.vue'
import type { TransferDraft } from '../transferDraft'
import type { TransferFailure } from '../transferFailure'
defineProps<{
  draft: TransferDraft
  pending: boolean
  failure?: TransferFailure
}>()
defineEmits<{ back: []; confirm: [] }>()
</script>
<template>
  <div class="space-y-7">
    <div>
      <h2 class="text-xl font-semibold text-highlighted">Review your transfer</h2>
      <p class="mt-2 text-sm text-muted">Make sure everything looks right before you send.</p>
    </div>
    <div class="rounded-2xl bg-primary/5 p-6">
      <p class="text-sm text-muted">You're sending</p>
      <div class="mt-2 flex flex-wrap items-baseline gap-2">
        <MoneyDisplay
          :amount-minor="draft.request.amountMinor"
          class="text-3xl font-semibold text-highlighted"
        />
        <span class="text-sm text-muted">{{ draft.request.currency }}</span>
      </div>
    </div>
    <dl class="divide-y divide-default text-sm">
      <div class="grid gap-2 py-4 sm:grid-cols-[100px_1fr]">
        <dt class="text-muted">From</dt>
        <dd>
          <p class="font-medium text-highlighted">{{ draft.source.displayName }}</p>
          <MaskedAccountNumber :account-number="draft.source.accountNumber" class="mt-1" />
          <p class="mt-2 text-muted">
            Balance at review
            <MoneyDisplay :amount-minor="draft.source.balanceMinor" />
          </p>
        </dd>
      </div>
      <div class="grid gap-2 py-4 sm:grid-cols-[100px_1fr]">
        <dt class="text-muted">To</dt>
        <dd>
          <p class="font-medium text-highlighted">{{ draft.recipient.name }}</p>
          <p class="mt-1 text-muted">{{ draft.recipient.bankName }}</p>
          <MaskedAccountNumber :account-number="draft.recipient.accountNumber" class="mt-1" />
        </dd>
      </div>
      <div class="grid gap-2 py-4 sm:grid-cols-[100px_1fr]">
        <dt class="text-muted">Reference</dt>
        <dd class="break-words font-medium text-highlighted">
          {{ draft.request.reference || 'No reference' }}
        </dd>
      </div>
    </dl>
    <p
      v-if="failure"
      role="alert"
      class="rounded-xl border border-error/20 bg-error/5 p-4 text-sm leading-6 text-error"
    >
      {{ failure.message }}
    </p>
    <p v-if="draft.request.destination.kind === 'NEW_BENEFICIARY'" class="text-sm text-muted">
      {{
        draft.request.destination.saveRecipient !== false
          ? 'This recipient will be saved after a successful transfer.'
          : 'This recipient will not be saved.'
      }}
    </p>
    <p v-if="pending" role="status" class="text-sm text-muted">
      Confirming your transfer. Please keep this page open.
    </p>
    <div class="flex flex-wrap justify-between gap-3 border-t border-default pt-6">
      <UButton
        color="neutral"
        variant="outline"
        size="lg"
        :disabled="pending || failure?.uncertain"
        @click="$emit('back')"
      >
        Back
      </UButton>
      <UButton v-if="failure?.conflict" to="/transactions" size="lg" icon="i-lucide-list">
        Check transaction activity
      </UButton>
      <UButton
        v-else
        size="lg"
        :loading="pending"
        :disabled="pending"
        icon="i-lucide-check"
        @click="$emit('confirm')"
      >
        {{ failure?.uncertain ? 'Retry same transfer' : 'Confirm transfer' }}
      </UButton>
    </div>
  </div>
</template>
