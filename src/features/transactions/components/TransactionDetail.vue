<script setup lang="ts">
import type { Transaction } from '@/domain/transactions/transaction'
import type { Account } from '@/domain/accounts/account'
import MoneyDisplay from '@/shared/components/MoneyDisplay.vue'
import MaskedAccountNumber from '@/shared/components/MaskedAccountNumber.vue'
import TransactionStatusBadge from './TransactionStatusBadge.vue'

defineProps<{ transaction: Transaction; account?: Account }>()
const timestamp = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'long',
  timeStyle: 'medium',
  timeZone: 'UTC',
})
const types = { TRANSFER: 'Transfer', CARD: 'Card', CASH: 'Cash', FEE: 'Fee', INTEREST: 'Interest' }
</script>

<template>
  <div class="min-w-0 space-y-6">
    <div class="rounded-2xl bg-primary/5 p-5">
      <p class="text-sm text-muted">
        {{ transaction.direction === 'CREDIT' ? 'Money in' : 'Money out' }}
      </p>
      <MoneyDisplay
        :amount-minor="transaction.amountMinor"
        :direction="transaction.direction"
        class="mt-2 block text-3xl font-semibold text-highlighted"
      />
      <p class="mt-1 text-sm text-muted">{{ transaction.currency }}</p>
    </div>
    <dl class="divide-y divide-default text-sm *:space-y-2 *:py-4">
      <div>
        <dt class="text-muted">Status</dt>
        <dd><TransactionStatusBadge :status="transaction.status" /></dd>
      </div>
      <div>
        <dt class="text-muted">Date and time · UTC</dt>
        <dd class="text-highlighted">
          <time :datetime="transaction.occurredAt">
            {{ timestamp.format(new Date(transaction.occurredAt)) }} UTC
          </time>
        </dd>
      </div>
      <div>
        <dt class="text-muted">Account</dt>
        <dd class="space-y-1 text-highlighted">
          <p class="break-words">{{ account?.displayName ?? 'Account unavailable' }}</p>
          <MaskedAccountNumber v-if="account" :account-number="account.accountNumber" />
        </dd>
      </div>
      <div>
        <dt class="text-muted">Direction</dt>
        <dd class="text-highlighted">
          {{ transaction.direction === 'CREDIT' ? 'Credit' : 'Debit' }}
        </dd>
      </div>
      <div>
        <dt class="text-muted">Type</dt>
        <dd class="text-highlighted">{{ types[transaction.type] }}</dd>
      </div>
      <div>
        <dt class="text-muted">Counterparty</dt>
        <dd class="break-words text-highlighted">
          {{ transaction.counterparty || 'Not provided' }}
        </dd>
      </div>
      <div>
        <dt class="text-muted">Description / reference</dt>
        <dd class="break-words text-highlighted">{{ transaction.description }}</dd>
      </div>
      <div>
        <dt class="text-muted">Transaction ID</dt>
        <dd class="break-all text-highlighted">{{ transaction.id }}</dd>
      </div>
      <div v-if="transaction.transferId">
        <dt class="text-muted">Transfer ID</dt>
        <dd class="break-all text-highlighted">{{ transaction.transferId }}</dd>
      </div>
    </dl>
  </div>
</template>
