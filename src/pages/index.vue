<script setup lang="ts">
definePageMeta({ title: 'Overview' })
import UButton from '@nuxt/ui/components/Button.vue'
import { useAccounts } from '@/features/accounts/composables/useAccounts'
import AccountSnapshot from '@/features/overview/components/AccountSnapshot.vue'
import AccountSummary from '@/features/accounts/components/AccountSummary.vue'
import ResetDemoButton from '@/features/demo/components/ResetDemoButton.vue'
import RecentTransactions from '@/features/overview/components/RecentTransactions.vue'
import DataState from '@/shared/components/DataState.vue'
const { data: accounts, isPending, isFetching, isError, error, refetch } = useAccounts()
</script>
<template>
  <section aria-labelledby="overview-title" class="py-2 sm:py-3">
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 id="overview-title" class="text-3xl font-semibold tracking-tight text-highlighted">
          Overview
        </h1>
        <p class="mt-1 text-sm text-muted">Your accounts and recent activity, at a glance.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <ResetDemoButton />
        <UButton to="/transfer" icon="i-lucide-arrow-up-right" size="lg" class="min-h-11">
          Transfer
        </UButton>
      </div>
    </div>
    <DataState
      :loading="isPending"
      :refreshing="isFetching && !isPending"
      skeleton="accounts"
      :error="isError ? error : null"
      :empty="!accounts?.length"
      label="accounts"
      empty-message="There are no accounts to display."
      @retry="refetch()"
    >
      <AccountSummary :accounts="accounts ?? []" compact />
      <div class="mt-3 mb-2 flex items-center justify-between gap-3">
        <h2 class="text-base font-semibold text-highlighted">Your accounts</h2>
        <UButton to="/accounts" color="neutral" variant="link" trailing-icon="i-lucide-arrow-right">
          Manage accounts
        </UButton>
      </div>
      <div class="grid gap-3 lg:grid-cols-3">
        <AccountSnapshot v-for="account in accounts" :key="account.id" :account="account" />
      </div>
    </DataState>
    <RecentTransactions :accounts="accounts ?? []" />
  </section>
</template>
