<script setup lang="ts">
definePageMeta({ title: 'Accounts' })
import UButton from '@nuxt/ui/components/Button.vue'
import { useAccounts } from '@/features/accounts/composables/useAccounts'
import AccountCard from '@/features/accounts/components/AccountCard.vue'
import AccountSummary from '@/features/accounts/components/AccountSummary.vue'
import ResetDemoButton from '@/features/demo/components/ResetDemoButton.vue'
import DataState from '@/shared/components/DataState.vue'
const { data: accounts, isPending, isFetching, isError, error, refetch } = useAccounts()
</script>
<template>
  <section aria-labelledby="accounts-title" class="py-2 sm:py-3">
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 id="accounts-title" class="text-3xl font-semibold tracking-tight text-highlighted">
          Accounts
        </h1>
        <p class="mt-2 text-base text-muted">Your balances and account availability.</p>
      </div>
      <ResetDemoButton />
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
      <AccountSummary :accounts="accounts ?? []" />
      <div class="mt-6 mb-4 flex items-center justify-between gap-4">
        <h2 class="text-xl font-semibold text-highlighted">Your accounts</h2>
        <UButton
          color="neutral"
          variant="ghost"
          class="min-h-11"
          :loading="isFetching"
          icon="i-lucide-refresh-cw"
          @click="refetch()"
        >
          Refresh
        </UButton>
      </div>
      <div class="grid gap-5 xl:grid-cols-3 md:grid-cols-2">
        <AccountCard v-for="account in accounts" :key="account.id" :account="account" />
      </div>
    </DataState>
  </section>
</template>
