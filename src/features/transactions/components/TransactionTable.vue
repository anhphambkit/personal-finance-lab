<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import TransactionStatusBadge from './TransactionStatusBadge.vue'
import UIcon from '@nuxt/ui/components/Icon.vue'
import UTable from '@nuxt/ui/components/Table.vue'
import USlideover from '@nuxt/ui/components/Slideover.vue'
import TransactionDetail from './TransactionDetail.vue'
import { tv } from '@nuxt/ui/utils/tv'
import type { TableColumn } from '@nuxt/ui'
import type { Transaction } from '@/domain/transactions/transaction'
import type { Account } from '@/domain/accounts/account'
import type { TransactionItemScope, TransactionSlots } from './transactionSlots'
import MoneyDisplay from '@/shared/components/MoneyDisplay.vue'
const props = withDefaults(
  defineProps<{
    transactions: Transaction[]
    accounts: Account[]
    variant?: 'full' | 'recent'
    columns?: TableColumn<Transaction>[]
    caption?: string
    ui?: Partial<Record<'root' | 'table' | 'list' | 'item' | 'th' | 'td', string>>
  }>(),
  { variant: 'full', columns: undefined, caption: undefined, ui: undefined },
)
defineSlots<TransactionSlots>()
const accountMap = computed(() => new Map(props.accounts.map((account) => [account.id, account])))
const detailOpen = ref(false)
const selected = ref<Transaction>()
let detailTrigger: HTMLElement | undefined
function openDetail(transaction: Transaction, event: MouseEvent) {
  selected.value = { ...transaction }
  detailTrigger = event.currentTarget as HTMLElement
  detailOpen.value = true
}
function restoreFocus(event: Event) {
  event.preventDefault()
  if (detailTrigger?.isConnected) detailTrigger.focus({ preventScroll: true })
}
// A filter, page or refreshed result should not leave an outdated detail open.
watch(
  () => props.transactions,
  () => {
    detailOpen.value = false
  },
)
function scope(
  transaction: Transaction,
  layout: TransactionItemScope['layout'],
): TransactionItemScope {
  return { transaction, account: accountMap.value.get(transaction.accountId), layout }
}
const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})
const defaultColumns: TableColumn<Transaction>[] = [
  { accessorKey: 'description', header: 'Transaction' },
  { accessorKey: 'occurredAt', header: 'Date · UTC' },
  { accessorKey: 'accountId', header: 'Account' },
  { accessorKey: 'type', header: 'Type' },
  { accessorKey: 'status', header: 'Status' },
  {
    accessorKey: 'amountMinor',
    header: 'Amount · USD',
    meta: { class: { th: 'text-right', td: 'text-right' } },
  },
]
const columns = computed(
  () =>
    props.columns ??
    (props.variant === 'recent'
      ? defaultColumns.filter(
          (column) =>
            !('accessorKey' in column) ||
            !['accountId', 'type'].includes(String(column.accessorKey)),
        )
      : defaultColumns),
)
const caption = computed(
  () =>
    props.caption ??
    (props.variant === 'recent' ? 'Recent transactions' : 'Account transactions, newest first'),
)
const types = { TRANSFER: 'Transfer', CARD: 'Card', CASH: 'Cash', FEE: 'Fee', INTEREST: 'Interest' }
const theme = tv({
  slots: {
    root: '',
    table:
      'bank-surface bank-transaction-table hidden rounded-2xl border border-default bg-default',
    list: 'bank-surface bank-transaction-list divide-y divide-default rounded-2xl border border-default bg-default',
    item: 'space-y-3 p-4 sm:p-5',
    th: 'bg-elevated px-4 py-3 text-xs font-medium text-muted',
    td: 'px-4 py-4 text-sm',
  },
  variants: {
    variant: {
      full: { table: 'lg:block', list: 'lg:hidden' },
      recent: { table: 'md:block', list: 'md:hidden' },
    },
  },
})
const styles = computed(() => theme({ variant: props.variant }))
</script>

<template>
  <div :class="styles.root({ class: props.ui?.root })">
    <UTable
      :data="transactions"
      :columns="columns"
      :caption="caption"
      :class="styles.table({ class: props.ui?.table })"
      :ui="{
        th: styles.th({ class: props.ui?.th }),
        td: styles.td({ class: props.ui?.td }),
        caption: 'sr-only',
      }"
    >
      <template #description-cell="{ row }">
        <slot name="description" v-bind="scope(row.original, 'table')">
          <div class="flex items-center gap-3">
            <span
              class="bank-transaction-icon"
              :class="
                row.original.direction === 'CREDIT'
                  ? 'bank-transaction-icon--credit'
                  : 'bank-transaction-icon--debit'
              "
            >
              <UIcon
                :name="
                  row.original.direction === 'CREDIT'
                    ? 'i-lucide-arrow-down-left'
                    : 'i-lucide-arrow-up-right'
                "
                class="size-4.5"
                aria-hidden="true"
              />
            </span>
            <div class="min-w-0 whitespace-normal">
              <button
                type="button"
                class="rounded text-left font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
                :aria-label="`View details: ${row.original.description} (${row.original.id})`"
                @click="openDetail(row.original, $event)"
              >
                {{ row.original.description }}
              </button>
              <template v-if="variant === 'full'">
                <p v-if="row.original.counterparty" class="mt-1 text-sm text-muted">
                  {{ row.original.counterparty }}
                </p>
                <p class="mt-1 text-xs text-muted">{{ row.original.id }}</p>
              </template>
              <p v-else class="mt-1 text-xs text-muted">
                <slot name="account" v-bind="scope(row.original, 'table')">
                  {{ accountMap.get(row.original.accountId)?.displayName ?? 'Account' }}
                </slot>
              </p>
            </div>
          </div>
        </slot>
      </template>
      <template #occurredAt-cell="{ row }">
        <slot name="date" v-bind="scope(row.original, 'table')">
          <time :datetime="row.original.occurredAt" class="text-muted">
            {{ dateFormat.format(new Date(row.original.occurredAt)) }}
          </time>
        </slot>
      </template>
      <template #accountId-cell="{ row }">
        <slot name="account" v-bind="scope(row.original, 'table')">
          <span class="whitespace-normal">
            {{ accountMap.get(row.original.accountId)?.displayName ?? 'Account' }}
          </span>
        </slot>
      </template>
      <template #type-cell="{ row }">
        <slot name="type" v-bind="scope(row.original, 'table')">
          {{ types[row.original.type] }}
        </slot>
      </template>
      <template #status-cell="{ row }">
        <slot name="status" v-bind="scope(row.original, 'table')">
          <TransactionStatusBadge :status="row.original.status" />
        </slot>
      </template>
      <template #amountMinor-cell="{ row }">
        <slot name="amount" v-bind="scope(row.original, 'table')">
          <MoneyDisplay
            :amount-minor="row.original.amountMinor"
            :direction="row.original.direction"
            class="font-semibold"
            :class="row.original.direction === 'CREDIT' ? 'text-green-700' : 'text-highlighted'"
          />
          <p v-if="variant === 'full'" class="mt-1 text-xs text-muted">
            {{ row.original.direction === 'CREDIT' ? 'Money in' : 'Money out' }}
          </p>
        </slot>
      </template>
    </UTable>
    <ul :aria-label="caption" :class="styles.list({ class: props.ui?.list })">
      <li
        v-for="entry in transactions"
        :key="entry.id"
        :class="styles.item({ class: props.ui?.item })"
      >
        <slot name="mobile-item" v-bind="scope(entry, 'mobile')">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 break-words">
              <slot name="description" v-bind="scope(entry, 'mobile')">
                <button
                  type="button"
                  class="min-h-11 rounded text-left font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
                  :aria-label="`View details: ${entry.description} (${entry.id})`"
                  @click="openDetail(entry, $event)"
                >
                  {{ entry.description }}
                </button>
                <p v-if="variant === 'full' && entry.counterparty" class="mt-1 text-sm text-muted">
                  {{ entry.counterparty }}
                </p>
              </slot>
            </div>
            <div class="max-w-[50%] min-w-0 shrink-0 text-right">
              <slot name="amount" v-bind="scope(entry, 'mobile')">
                <MoneyDisplay
                  :amount-minor="entry.amountMinor"
                  :direction="entry.direction"
                  class="font-semibold"
                  :class="entry.direction === 'CREDIT' ? 'text-green-700' : 'text-highlighted'"
                />
                <p v-if="variant === 'full'" class="mt-1 text-xs text-muted">
                  {{ entry.direction === 'CREDIT' ? 'Money in' : 'Money out' }} · USD
                </p>
              </slot>
            </div>
          </div>
          <div class="text-sm text-muted">
            <slot name="account" v-bind="scope(entry, 'mobile')">
              {{ accountMap.get(entry.accountId)?.displayName ?? 'Account' }}
            </slot>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>
              <slot name="date" v-bind="scope(entry, 'mobile')">
                <time :datetime="entry.occurredAt">
                  {{ dateFormat.format(new Date(entry.occurredAt)) }}
                </time>
                · UTC
              </slot>
              <template v-if="variant === 'full'">
                ·
                <slot name="type" v-bind="scope(entry, 'mobile')">{{ types[entry.type] }}</slot>
              </template>
            </span>
            <slot name="status" v-bind="scope(entry, 'mobile')">
              <TransactionStatusBadge :status="entry.status" />
            </slot>
          </div>
          <p v-if="variant === 'full'" class="text-xs break-all text-muted">{{ entry.id }}</p>
        </slot>
      </li>
    </ul>
    <USlideover
      v-model:open="detailOpen"
      title="Transaction details"
      description="Details for this account activity."
      :content="{ onCloseAutoFocus: restoreFocus }"
      :ui="{ content: 'w-full max-w-md', body: 'min-w-0 overflow-y-auto' }"
    >
      <template #body>
        <TransactionDetail
          v-if="selected"
          :transaction="selected"
          :account="accountMap.get(selected.accountId)"
        />
      </template>
    </USlideover>
  </div>
</template>
