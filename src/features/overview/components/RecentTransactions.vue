<script setup lang="ts">
import { computed, onServerPrefetch, useId, type VNodeChild } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import UButton from '@nuxt/ui/components/Button.vue'
import type { RouteLocationRaw } from 'vue-router'
import type { Transaction } from '@/domain/transactions/transaction'
import type { Account } from '@/domain/accounts/account'
import { useBankingContext } from '@/data/api/bankingContext'
import { bankingQueryKeys } from '@/data/api/bankingQueryKeys'
import DataState from '@/shared/components/DataState.vue'
import BankingSkeleton from '@/shared/components/BankingSkeleton.vue'
import TransactionTable from '@/features/transactions/components/TransactionTable.vue'
import {
  transactionSlotNames,
  type TransactionSlots,
} from '@/features/transactions/components/transactionSlots'
const props = withDefaults(
  defineProps<{
    accounts: Account[]
    title?: string
    limit?: number
    viewAllTo?: RouteLocationRaw
  }>(),
  {
    title: 'Recent activity',
    limit: 5,
    viewAllTo: '/transactions',
  },
)
interface ActivityScope {
  transactions: Transaction[]
  accounts: Account[]
  refreshing: boolean
}
const slots = defineSlots<
  TransactionSlots & {
    header?(props: { title: string }): VNodeChild
    actions?(): VNodeChild
    default?(props: ActivityScope): VNodeChild
    loading?(props: { label: string }): VNodeChild
    error?(props: { error: unknown; label: string; retry: () => void }): VNodeChild
    empty?(props: { label: string; message: string }): VNodeChild
    refreshing?(props: { label: string }): VNodeChild
  }
>()
const forwardedSlots = () => transactionSlotNames.filter((name) => !!slots[name])
const headingId = `recent-${useId()}`
const limit = computed(() =>
  Number.isFinite(props.limit) ? Math.min(100, Math.max(1, Math.floor(props.limit))) : 5,
)
const query = computed(() => ({ page: 1, pageSize: limit.value }))
const { api, ready } = useBankingContext()
const { data, isPending, isFetching, isError, error, refetch, suspense } = useQuery({
  enabled: ready,
  queryKey: computed(() => bankingQueryKeys.transactions(query.value)),
  queryFn: ({ signal }) => api.transactions(query.value, signal),
})
onServerPrefetch(async () => {
  if (ready.value) await suspense().catch(() => {})
})
</script>
<template>
  <section :aria-labelledby="headingId" class="mt-4">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 :id="headingId" class="text-xl font-semibold text-highlighted">
        <slot name="header" :title="title">{{ title }}</slot>
      </h2>
      <slot name="actions">
        <UButton
          :to="viewAllTo"
          color="neutral"
          variant="link"
          trailing-icon="i-lucide-arrow-right"
        >
          View transactions
        </UButton>
      </slot>
    </div>
    <DataState
      :loading="isPending"
      :refreshing="isFetching && !isPending"
      skeleton="transactions"
      :error="isError ? error : null"
      :empty="!data?.data.length"
      label="transactions"
      empty-message="Your account activity will appear here."
      @retry="refetch()"
    >
      <template #loading="state">
        <slot name="loading" v-bind="state">
          <BankingSkeleton variant="transactions" :count="limit" />
        </slot>
      </template>
      <template v-if="$slots.error" #error="state"><slot name="error" v-bind="state" /></template>
      <template v-if="$slots.empty" #empty="state"><slot name="empty" v-bind="state" /></template>
      <template v-if="$slots.refreshing" #refreshing="state">
        <slot name="refreshing" v-bind="state" />
      </template>
      <template #default>
        <slot :transactions="data?.data ?? []" :accounts="accounts" :refreshing="isFetching">
          <TransactionTable :transactions="data?.data ?? []" :accounts="accounts" variant="recent">
            <template v-for="name in forwardedSlots()" :key="name" #[name]="item">
              <slot :name="name" v-bind="item" />
            </template>
          </TransactionTable>
        </slot>
      </template>
    </DataState>
  </section>
</template>
