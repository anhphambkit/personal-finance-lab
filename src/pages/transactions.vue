<script setup lang="ts">
definePageMeta({ title: 'Transactions' })
import UButton from '@nuxt/ui/components/Button.vue'
import { useAccounts } from '@/features/accounts/composables/useAccounts'
import { useTransactionRoute } from '@/features/transactions/composables/useTransactionRoute'
import { useTransactions } from '@/features/transactions/composables/useTransactions'
import TransactionFilters from '@/features/transactions/components/TransactionFilters.vue'
import TransactionTable from '@/features/transactions/components/TransactionTable.vue'
import TransactionPagination from '@/features/transactions/components/TransactionPagination.vue'
import DataState from '@/shared/components/DataState.vue'

const { query, filters, hasFilters, invalid, applyFilters, clearFilters, setPage, setPageSize } =
  useTransactionRoute()
const accounts = useAccounts()
const { data, isFetching, isPending, isError, error, refetch } = useTransactions(query)
function retry() {
  if (accounts.isError.value) void accounts.refetch()
  void refetch()
}
</script>

<template>
  <section aria-labelledby="transactions-title" class="min-w-0 py-2 sm:py-3">
    <div class="mb-6">
      <h1 id="transactions-title" class="text-3xl font-semibold tracking-tight text-highlighted">
        Transactions
      </h1>
      <p class="mt-2 text-base text-muted">
        Review your account activity and find a specific transaction.
      </p>
    </div>
    <TransactionFilters
      :filters="filters"
      :accounts="accounts.data.value ?? []"
      :busy="isFetching"
      @apply="applyFilters"
      @clear="clearFilters"
    />
    <div v-if="invalid" role="alert" class="mt-6 rounded-xl border border-error/25 bg-error/5 p-6">
      <h2 class="font-semibold text-highlighted">Check the filters in this link</h2>
      <p class="mt-2 text-sm text-toned">
        A filter, date range or page number is invalid. Update and apply your filters, or clear them
        to start again.
      </p>
      <UButton class="mt-4" color="neutral" variant="outline" @click="clearFilters">
        Clear invalid filters
      </UButton>
    </div>
    <div v-else class="mt-6" :aria-busy="isFetching || accounts.isFetching.value">
      <DataState
        :loading="isPending || accounts.isPending.value"
        :refreshing="isFetching || accounts.isFetching.value"
        skeleton="transactions"
        :error="accounts.isError.value ? accounts.error.value : isError ? error : null"
        :empty="false"
        label="transactions"
        empty-message=""
        @retry="retry"
      >
        <div v-if="data">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p role="status" aria-live="polite" class="text-sm text-muted">
              {{ data.pagination.totalItems }}
              {{ data.pagination.totalItems === 1 ? 'transaction' : 'transactions'
              }}{{ hasFilters ? ' matching your filters' : '' }} · Newest first
            </p>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-refresh-cw"
              :loading="isFetching"
              class="min-h-11"
              @click="refetch()"
            >
              Refresh
            </UButton>
          </div>
          <TransactionTable
            v-if="data.data.length"
            :transactions="data.data"
            :accounts="accounts.data.value ?? []"
          />
          <div v-else class="rounded-xl border border-default bg-default px-6 py-12 text-center">
            <template v-if="data.pagination.totalItems > 0">
              <h2 class="text-lg font-semibold text-highlighted">This page has no transactions</h2>
              <p class="mt-2 text-sm text-muted">
                Return to the first page to view the available results.
              </p>
              <UButton class="mt-4 min-h-11" @click="setPage(1)">Go to first page</UButton>
            </template>
            <template v-else-if="hasFilters">
              <h2 class="text-lg font-semibold text-highlighted">No matching transactions</h2>
              <p class="mt-2 text-sm text-muted">
                Try a different search or date range, or clear your filters.
              </p>
              <UButton class="mt-4 min-h-11" @click="clearFilters">Show all transactions</UButton>
            </template>
            <template v-else>
              <h2 class="text-lg font-semibold text-highlighted">No transactions yet</h2>
              <p class="mt-2 text-sm text-muted">Your account activity will appear here.</p>
            </template>
          </div>
          <TransactionPagination
            v-if="data.pagination.totalItems > 0 && data.data.length"
            :pagination="data.pagination"
            :busy="isFetching"
            @page="setPage"
            @page-size="setPageSize"
          />
        </div>
      </DataState>
    </div>
  </section>
</template>
