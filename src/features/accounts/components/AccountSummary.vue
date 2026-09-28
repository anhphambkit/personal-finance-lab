<script setup lang="ts">
import { computed, type VNodeChild } from 'vue'
import UIcon from '@nuxt/ui/components/Icon.vue'
import type { Account } from '@/domain/accounts/account'
import MoneyDisplay from '@/shared/components/MoneyDisplay.vue'
const props = defineProps<{ accounts: Account[]; compact?: boolean }>()
const total = computed(() =>
  props.accounts.reduce((sum, account) => sum + BigInt(account.balanceMinor), 0n),
)
const active = computed(() =>
  props.accounts
    .filter((account) => account.status === 'ACTIVE')
    .reduce((sum, account) => sum + BigInt(account.balanceMinor), 0n),
)
const frozen = computed(() => total.value - active.value)
interface SummaryScope {
  accounts: Account[]
  total: bigint
  active: bigint
  frozen: bigint
}
defineSlots<{
  total?(props: SummaryScope): VNodeChild
  active?(props: SummaryScope): VNodeChild
  frozen?(props: SummaryScope): VNodeChild
}>()
const scope = computed(() => ({
  accounts: props.accounts,
  total: total.value,
  active: active.value,
  frozen: frozen.value,
}))
</script>
<template>
  <section
    v-if="compact"
    aria-label="Account summary"
    class="bank-summary grid grid-cols-2 gap-3 border px-4 py-3 sm:grid-cols-[1.4fr_1fr_1fr] sm:items-center"
  >
    <div class="col-span-2 min-w-0 sm:col-span-1">
      <slot name="total" v-bind="scope">
        <h2 class="text-xs font-medium text-muted">Total balance · USD</h2>
        <MoneyDisplay
          :amount-minor="total"
          class="mt-1 block text-2xl font-semibold tracking-tight text-highlighted"
        />
        <p class="mt-0.5 text-xs text-muted">
          {{ accounts.length }} accounts · Includes frozen balances
        </p>
      </slot>
    </div>
    <div
      class="min-w-0 border-t border-indigo-200/60 pt-2 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4"
    >
      <slot name="active" v-bind="scope">
        <p class="flex items-center gap-1.5 text-xs text-muted">
          <UIcon
            name="i-lucide-circle-check"
            class="size-3.5 shrink-0 text-emerald-700"
            aria-hidden="true"
          />
          In active accounts
        </p>
        <MoneyDisplay
          :amount-minor="active"
          class="mt-1 block text-lg font-semibold tracking-tight text-highlighted"
        />
      </slot>
    </div>
    <div
      class="min-w-0 border-t border-indigo-200/60 pt-2 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4"
    >
      <slot name="frozen" v-bind="scope">
        <p class="flex items-center gap-1.5 text-xs text-muted">
          <UIcon
            name="i-lucide-lock-keyhole"
            class="size-3.5 shrink-0 text-amber-700"
            aria-hidden="true"
          />
          In frozen accounts
        </p>
        <MoneyDisplay
          :amount-minor="frozen"
          class="mt-1 block text-lg font-semibold tracking-tight text-highlighted"
        />
      </slot>
    </div>
  </section>
  <section
    v-else
    aria-label="Account summary"
    class="bank-summary grid grid-cols-2 gap-5 rounded-3xl border p-5 sm:p-7 md:grid-cols-[1.5fr_1fr_1fr] md:items-center"
  >
    <div class="col-span-2 min-w-0 md:col-span-1">
      <slot name="total" v-bind="scope">
        <h2 class="flex items-center gap-2 text-sm font-medium text-muted">
          <UIcon name="i-lucide-wallet" class="size-4 text-primary" aria-hidden="true" />
          Total balance · USD
        </h2>
        <MoneyDisplay
          :amount-minor="total"
          class="mt-3 block text-4xl font-semibold tracking-tight text-highlighted sm:text-5xl"
        />
        <p class="mt-2 text-sm text-muted">
          Across {{ accounts.length }} {{ accounts.length === 1 ? 'account' : 'accounts' }},
          including frozen balances
        </p>
      </slot>
    </div>
    <div
      class="min-w-0 border-t border-indigo-200/60 pt-5 md:border-t-0 md:border-l md:pt-0 md:pl-6"
    >
      <slot name="active" v-bind="scope">
        <span
          class="mb-3 flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"
        >
          <UIcon name="i-lucide-circle-check" class="size-4.5" aria-hidden="true" />
        </span>
        <p class="text-sm text-muted">In active accounts</p>
        <MoneyDisplay
          :amount-minor="active"
          class="mt-2 block text-base font-semibold tracking-tight text-highlighted min-[360px]:text-lg sm:text-xl"
        />
      </slot>
    </div>
    <div
      class="min-w-0 border-t border-indigo-200/60 pt-5 md:border-t-0 md:border-l md:pt-0 md:pl-6"
    >
      <slot name="frozen" v-bind="scope">
        <span
          class="mb-3 flex size-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800"
        >
          <UIcon name="i-lucide-lock-keyhole" class="size-4.5" aria-hidden="true" />
        </span>
        <p class="text-sm text-muted">In frozen accounts</p>
        <MoneyDisplay
          :amount-minor="frozen"
          class="mt-2 block text-base font-semibold tracking-tight text-highlighted min-[360px]:text-lg sm:text-xl"
        />
      </slot>
    </div>
  </section>
</template>
