<script setup lang="ts">
import UButton from '@nuxt/ui/components/Button.vue'
import UIcon from '@nuxt/ui/components/Icon.vue'
import MoneyDisplay from '@/shared/components/MoneyDisplay.vue'
import MaskedAccountNumber from '@/shared/components/MaskedAccountNumber.vue'
import type { TransferReceipt } from '@/contracts/transfers'
defineProps<{
  receipt: TransferReceipt
  recipient: { name: string; bankName: string; accountNumber: string }
}>()
defineEmits<{ another: [] }>()
const dateFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'long',
  timeZone: 'UTC',
})
</script>
<template>
  <div class="space-y-7">
    <div class="text-center">
      <span
        class="mx-auto flex size-14 items-center justify-center rounded-full bg-green-100 text-green-700"
      >
        <UIcon name="i-lucide-check" class="size-7" />
      </span>
      <h2 class="mt-4 text-2xl font-semibold text-highlighted" role="status">Transfer complete</h2>
      <p class="mt-2 text-sm text-muted">Your transfer has been completed successfully.</p>
      <MoneyDisplay
        :amount-minor="receipt.amountMinor"
        class="mt-5 text-3xl font-semibold text-highlighted"
      />
      <p class="mt-1 text-sm text-muted">{{ receipt.currency }}</p>
    </div>
    <dl class="divide-y divide-default text-sm">
      <div class="grid gap-2 py-4 sm:grid-cols-[120px_1fr]">
        <dt class="text-muted">Recipient</dt>
        <dd class="min-w-0">
          <p class="font-medium text-highlighted">{{ recipient.name }}</p>
          <p class="mt-1 text-muted">{{ recipient.bankName }}</p>
          <MaskedAccountNumber :account-number="recipient.accountNumber" class="mt-1" />
        </dd>
      </div>
      <div class="grid gap-2 py-4 sm:grid-cols-[120px_1fr]">
        <dt class="text-muted">Reference</dt>
        <dd class="break-words">{{ receipt.reference || 'No reference' }}</dd>
      </div>
      <div class="grid gap-2 py-4 sm:grid-cols-[120px_1fr]">
        <dt class="text-muted">Transfer ID</dt>
        <dd class="break-all font-mono text-xs leading-6">{{ receipt.id }}</dd>
      </div>
      <div class="grid gap-2 py-4 sm:grid-cols-[120px_1fr]">
        <dt class="text-muted">Completed</dt>
        <dd>
          <time :datetime="receipt.completedAt">
            {{ dateFormat.format(new Date(receipt.completedAt)) }}
          </time>
        </dd>
      </div>
    </dl>
    <div class="flex flex-wrap gap-3 border-t border-default pt-6">
      <UButton to="/transactions" size="lg">View transactions</UButton>
      <UButton color="neutral" variant="outline" size="lg" @click="$emit('another')">
        Make another transfer
      </UButton>
      <UButton to="/accounts" color="neutral" variant="ghost" size="lg">Back to accounts</UButton>
    </div>
  </div>
</template>
