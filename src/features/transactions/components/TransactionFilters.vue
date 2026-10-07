<script setup lang="ts">
import { computed, ref, watch, type VNodeChild } from 'vue'
import UButton from '@nuxt/ui/components/Button.vue'
import UInput from '@nuxt/ui/components/Input.vue'
import USelect from '@nuxt/ui/components/Select.vue'
import type { Account } from '@/domain/accounts/account'
import { maskAccountNumber } from '@/domain/accounts/maskAccountNumber'
import { transactionQuerySchema } from '@/data/api/transactionQuerySchema'
import type { TransactionFiltersValue } from '../transactionFilters'

const props = withDefaults(
  defineProps<{
    filters: TransactionFiltersValue
    accounts: Account[]
    busy?: boolean
    idPrefix?: string
  }>(),
  { busy: false, idPrefix: 'transaction' },
)
const emit = defineEmits<{ apply: [filters: TransactionFiltersValue]; clear: [] }>()
const draft = ref({ ...props.filters })
const error = ref('')
interface FilterScope {
  draft: Readonly<TransactionFiltersValue>
  update: (patch: Partial<TransactionFiltersValue>) => void
  busy: boolean
}
interface SelectScope extends FilterScope {
  items: { label: string; value: string }[]
}
defineSlots<{
  search?(props: FilterScope): VNodeChild
  account?(props: SelectScope): VNodeChild
  direction?(props: SelectScope): VNodeChild
  type?(props: SelectScope): VNodeChild
  status?(props: SelectScope): VNodeChild
  dates?(props: FilterScope): VNodeChild
  'extra-fields'?(props: FilterScope): VNodeChild
  actions?(props: FilterScope & { apply: () => void; clear: () => void }): VNodeChild
  error?(props: { message: string }): VNodeChild
}>()
function update(patch: Partial<TransactionFiltersValue>) {
  draft.value = { ...draft.value, ...patch }
}
const fieldScope = computed(() => ({ draft: draft.value, update, busy: props.busy }))
const filtersValid = computed(() => {
  const values = Object.fromEntries(Object.entries(draft.value).filter(([, value]) => value.trim()))
  return transactionQuerySchema.safeParse(values).success
})
watch(
  () => props.filters,
  (filters) => {
    draft.value = { ...filters }
    error.value = ''
  },
)
const accountItems = computed(() => [
  { label: 'All accounts', value: 'ALL' },
  ...props.accounts.map((account) => ({
    label: `${account.displayName} · ${maskAccountNumber(account.accountNumber)}${account.status === 'FROZEN' ? ' · Frozen' : ''}`,
    value: account.id,
  })),
])
const selectFilters: {
  key: 'direction' | 'type' | 'status'
  label: string
  items: { label: string; value: string }[]
}[] = [
  {
    key: 'direction',
    label: 'Direction',
    items: [
      { label: 'All directions', value: 'ALL' },
      { label: 'Money out', value: 'DEBIT' },
      { label: 'Money in', value: 'CREDIT' },
    ],
  },
  {
    key: 'type',
    label: 'Type',
    items: [
      { label: 'All types', value: 'ALL' },
      { label: 'Transfer', value: 'TRANSFER' },
      { label: 'Card', value: 'CARD' },
      { label: 'Cash', value: 'CASH' },
      { label: 'Fee', value: 'FEE' },
      { label: 'Interest', value: 'INTEREST' },
    ],
  },
  {
    key: 'status',
    label: 'Status',
    items: [
      { label: 'All statuses', value: 'ALL' },
      { label: 'Completed', value: 'COMPLETED' },
      { label: 'Pending', value: 'PENDING' },
      { label: 'Failed', value: 'FAILED' },
    ],
  },
]
function apply() {
  if (props.busy) return
  if (!filtersValid.value) {
    validateOnBlur()
    return
  }
  const values = Object.fromEntries(Object.entries(draft.value).filter(([, value]) => value.trim()))
  const parsed = transactionQuerySchema.safeParse(values)
  if (!parsed.success) {
    error.value =
      draft.value.dateFrom && draft.value.dateTo && draft.value.dateFrom > draft.value.dateTo
        ? 'Start date must be on or before end date.'
        : 'Check your filters. Use valid dates and a search of at most 200 characters.'
    return
  }
  error.value = ''
  emit('apply', { ...draft.value })
}
function validateOnBlur() {
  if (filtersValid.value) {
    error.value = ''
    return
  }
  error.value =
    draft.value.dateFrom && draft.value.dateTo && draft.value.dateFrom > draft.value.dateTo
      ? 'Start date must be on or before end date.'
      : 'Check your filters. Use valid dates and a search of at most 200 characters.'
}
function clear() {
  // Clear local edits even when the URL already contains no filters.
  draft.value = {
    query: '',
    accountId: '',
    direction: '',
    type: '',
    status: '',
    dateFrom: '',
    dateTo: '',
  }
  error.value = ''
  emit('clear')
}
</script>
<template>
  <form
    aria-label="Transaction filters"
    class="bank-surface transaction-filters rounded-2xl border border-default bg-default p-3 sm:p-4"
    @submit.prevent="apply"
    @focusout="validateOnBlur"
  >
    <div class="filter-grid">
      <div class="filter-search min-w-0">
        <slot name="search" v-bind="fieldScope">
          <label
            :for="`${idPrefix}-search`"
            class="mb-1 block text-xs font-medium text-highlighted"
          >
            Search transactions
          </label>
          <UInput
            :id="`${idPrefix}-search`"
            v-model="draft.query"
            type="search"
            icon="i-lucide-search"
            placeholder="Search description, name or ID"
            :maxlength="200"
            size="md"
            class="w-full"
          />
        </slot>
      </div>
      <div class="filter-account min-w-0">
        <slot name="account" v-bind="fieldScope" :items="accountItems">
          <label
            :for="`${idPrefix}-account`"
            class="mb-1 block text-xs font-medium text-highlighted"
          >
            Account
          </label>
          <USelect
            :id="`${idPrefix}-account`"
            :model-value="draft.accountId || 'ALL'"
            :items="accountItems"
            size="md"
            class="w-full"
            @update:model-value="draft.accountId = $event === 'ALL' ? '' : $event"
          />
        </slot>
      </div>
      <div v-for="filter in selectFilters" :key="filter.key" class="min-w-0">
        <slot :name="filter.key" v-bind="fieldScope" :items="filter.items">
          <label
            :for="`${idPrefix}-${filter.key}`"
            class="mb-1 block text-xs font-medium text-highlighted"
          >
            {{ filter.label }}
          </label>
          <USelect
            :id="`${idPrefix}-${filter.key}`"
            :model-value="draft[filter.key] || 'ALL'"
            :items="[...filter.items]"
            size="md"
            class="w-full"
            @update:model-value="draft[filter.key] = $event === 'ALL' ? '' : $event"
          />
        </slot>
      </div>
      <div class="filter-dates grid min-w-0 grid-cols-2 gap-3">
        <slot name="dates" v-bind="fieldScope">
          <div class="min-w-0">
            <label
              :for="`${idPrefix}-date-from`"
              class="mb-1 block text-xs font-medium text-highlighted"
            >
              From (UTC)
            </label>
            <UInput
              :id="`${idPrefix}-date-from`"
              v-model="draft.dateFrom"
              type="date"
              size="md"
              class="w-full"
              :aria-describedby="error ? `${idPrefix}-filter-error` : undefined"
            />
          </div>
          <div class="min-w-0">
            <label
              :for="`${idPrefix}-date-to`"
              class="mb-1 block text-xs font-medium text-highlighted"
            >
              To (UTC)
            </label>
            <UInput
              :id="`${idPrefix}-date-to`"
              v-model="draft.dateTo"
              type="date"
              size="md"
              class="w-full"
              :aria-describedby="error ? `${idPrefix}-filter-error` : undefined"
            />
          </div>
        </slot>
      </div>
      <div class="filter-actions flex flex-wrap items-center gap-2">
        <slot name="actions" v-bind="fieldScope" :apply="apply" :clear="clear">
          <UButton
            :loading="busy"
            :disabled="busy || !filtersValid"
            type="submit"
            class="min-h-10"
            icon="i-lucide-list-filter"
          >
            Apply filters
          </UButton>
          <UButton type="button" color="neutral" variant="ghost" class="min-h-10" @click="clear">
            Clear filters
          </UButton>
          <p class="filter-date-hint text-xs text-muted">Dates include the full day in UTC.</p>
        </slot>
      </div>
      <slot name="extra-fields" v-bind="fieldScope" />
    </div>
    <p v-if="error" :id="`${idPrefix}-filter-error`" role="alert" class="mt-3 text-sm text-error">
      <slot name="error" :message="error">{{ error }}</slot>
    </p>
  </form>
</template>

<style scoped>
.transaction-filters {
  container-type: inline-size;
}
.filter-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: end;
}
.filter-search,
.filter-account,
.filter-dates,
.filter-actions {
  grid-column: 1 / -1;
}
@container (min-width: 700px) {
  .filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1.8fr)) repeat(3, minmax(0, 1fr));
  }
  .filter-search,
  .filter-account {
    grid-column: auto;
  }
  .filter-dates {
    grid-column: 1 / 3;
  }
  .filter-actions {
    grid-column: 3 / -1;
    min-height: 40px;
  }
  .filter-date-hint {
    flex-basis: 100%;
  }
}
@container (min-width: 1000px) {
  .filter-date-hint {
    flex-basis: auto;
    margin-left: auto;
  }
}
</style>
