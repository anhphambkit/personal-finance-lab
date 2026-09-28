<script setup lang="ts">
definePageMeta({ title: 'Spending insights' })
import { computed, ref, watch } from 'vue'
import { useRoute } from '#app'
import UButton from '@nuxt/ui/components/Button.vue'
import UInput from '@nuxt/ui/components/Input.vue'
import USelect from '@nuxt/ui/components/Select.vue'
import { useAccounts } from '@/features/accounts/composables/useAccounts'
import { useSpendingRoute } from '@/features/insights/composables/useSpendingRoute'
import { useSpendingInsights } from '@/features/insights/composables/useSpendingInsights'
import SpendingDashboard from '@/features/insights/components/SpendingDashboard.vue'
import DataState from '@/shared/components/DataState.vue'
import { ApiError } from '@/data/api/apiError'

const route = useRoute()
const { query, defaultMonth, invalid, apply, clear } = useSpendingRoute()
const accounts = useAccounts()
const { data, isPending, isFetching, isError, error, refetch } = useSpendingInsights(query)
const month = ref(defaultMonth.value)
const accountId = ref('')
const formError = ref('')
const insightErrorMessage = computed(() => {
  if (error.value instanceof ApiError) {
    if (error.value.code === 'UNKNOWN_SPENDING_ACCOUNT')
      return 'This account is unavailable. Choose another account or reset the filters.'
    if (error.value.code === 'SPENDING_DATA_LIMIT')
      return 'This range has too much activity. Select a single account to calculate insights.'
    if (error.value.code === 'INVALID_SPENDING_RESPONSE')
      return 'Spending data could not be verified. Refresh to load a complete set of transactions.'
  }
  return 'Your spending data could not be loaded. Please try again.'
})
watch(
  () => [route.query.month, route.query.accountId],
  () => {
    month.value = typeof route.query.month === 'string' ? route.query.month : defaultMonth.value
    accountId.value = typeof route.query.accountId === 'string' ? route.query.accountId : ''
    formError.value = ''
  },
  { immediate: true },
)
function submit() {
  formError.value = apply(month.value, accountId.value)
    ? ''
    : 'Choose a valid month between January 2000 and December 2099.'
}
function reset() {
  month.value = defaultMonth.value
  accountId.value = ''
  formError.value = ''
  void clear()
}
function retry() {
  if (accounts.isError.value) void accounts.refetch()
  void refetch()
}
</script>

<template>
  <section aria-labelledby="insights-title" class="min-w-0 py-2 sm:py-3">
    <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 id="insights-title" class="text-3xl font-semibold tracking-tight text-highlighted">
          Spending insights
        </h1>
        <p class="mt-2 text-base text-muted">See where your money goes, one month at a time.</p>
      </div>
      <UButton to="/transactions" color="neutral" variant="outline" icon="i-lucide-list-filter">
        View transactions
      </UButton>
    </div>
    <form
      aria-label="Spending filters"
      class="mb-6 rounded-2xl border border-default bg-default p-4 sm:p-5"
      @submit.prevent="submit"
    >
      <div class="flex flex-wrap items-end gap-4">
        <div class="min-w-0 flex-1 basis-44">
          <label for="spending-month" class="mb-1.5 block text-sm font-medium text-highlighted">
            Month (UTC)
          </label>
          <UInput
            id="spending-month"
            v-model="month"
            type="month"
            min="2000-01"
            max="2099-12"
            required
            class="w-full"
            :aria-describedby="formError ? 'spending-filter-error' : 'spending-period-note'"
          />
        </div>
        <div class="min-w-0 flex-1 basis-56">
          <label for="spending-account" class="mb-1.5 block text-sm font-medium text-highlighted">
            Account
          </label>
          <USelect
            id="spending-account"
            :model-value="accountId || 'ALL'"
            :items="[
              { label: 'All accounts', value: 'ALL' },
              ...(accounts.data.value ?? []).map((account) => ({
                label: account.displayName,
                value: account.id,
              })),
            ]"
            class="w-full"
            @update:model-value="accountId = $event === 'ALL' ? '' : String($event)"
          />
        </div>
        <UButton type="submit" class="min-h-9" icon="i-lucide-sliders-horizontal">
          Apply filters
        </UButton>
        <UButton type="button" color="neutral" variant="ghost" @click="reset()">
          Reset filters
        </UButton>
      </div>
      <p id="spending-period-note" class="mt-3 text-xs text-muted">
        Calendar months in UTC. Starts with the last completed month; selecting the current month
        shows spending recorded so far.
      </p>
      <p v-if="formError" id="spending-filter-error" role="alert" class="mt-3 text-sm text-error">
        {{ formError }}
      </p>
    </form>
    <div v-if="invalid" role="alert" class="rounded-xl border border-error/25 bg-error/5 p-6">
      <h2 class="font-semibold text-highlighted">Check the filters in this link</h2>
      <p class="mt-2 text-sm text-toned">Choose a valid month and account, or reset the filters.</p>
      <UButton class="mt-4" color="neutral" variant="outline" @click="reset()">
        Clear invalid filters
      </UButton>
    </div>
    <DataState
      v-else
      :loading="isPending || accounts.isPending.value"
      :refreshing="isFetching && !isPending"
      :error="accounts.isError.value ? accounts.error.value : isError ? error : null"
      :empty="false"
      label="spending insights"
      empty-message=""
      @retry="retry"
    >
      <template #error="{ retry: retryLoad }">
        <h2 class="font-semibold text-highlighted">Unable to load spending insights</h2>
        <p class="mt-2 text-sm text-toned">{{ insightErrorMessage }}</p>
        <UButton class="mt-4" color="neutral" variant="outline" @click="retryLoad()">Retry</UButton>
      </template>
      <div class="mb-3 flex justify-end">
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          :loading="isFetching"
          @click="refetch()"
        >
          Refresh
        </UButton>
      </div>
      <SpendingDashboard v-if="data" :insight="data" />
    </DataState>
  </section>
</template>
