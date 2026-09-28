<script setup lang="ts">
import UIcon from '@nuxt/ui/components/Icon.vue'
import type { Account } from '@/domain/accounts/account'
import AccountStatusBadge from '@/features/accounts/components/AccountStatusBadge.vue'
import MoneyDisplay from '@/shared/components/MoneyDisplay.vue'
import MaskedAccountNumber from '@/shared/components/MaskedAccountNumber.vue'

defineProps<{ account: Account }>()
</script>

<template>
  <article
    :aria-label="account.displayName"
    class="account-snapshot min-w-0 rounded-2xl border px-3.5 py-3"
    :class="
      account.status === 'FROZEN'
        ? 'account-snapshot--slate'
        : account.type === 'SAVINGS'
          ? 'account-snapshot--indigo'
          : 'account-snapshot--navy'
    "
  >
    <div class="flex items-center gap-2.5">
      <span
        class="snapshot-icon flex size-8 shrink-0 items-center justify-center rounded-xl text-white/90"
      >
        <UIcon
          :name="account.type === 'CHECKING' ? 'i-lucide-wallet' : 'i-lucide-vault'"
          class="size-4"
          aria-hidden="true"
        />
      </span>
      <div class="min-w-0 flex-1">
        <h3 class="text-sm font-semibold text-white">{{ account.displayName }}</h3>
        <p class="mt-0.5 text-xs text-white/75">
          {{ account.type === 'CHECKING' ? 'Checking' : 'Savings' }} ·
          <MaskedAccountNumber :account-number="account.accountNumber" />
        </p>
      </div>
      <AccountStatusBadge :status="account.status" size="sm" :show-icon="false" />
    </div>
    <div class="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <MoneyDisplay
        :amount-minor="account.balanceMinor"
        class="text-xl font-semibold tracking-tight text-white"
      />
      <span class="text-xs text-white/75">
        {{ account.currency }} ·
        {{ account.status === 'FROZEN' ? 'Transfers unavailable' : 'Current balance' }}
      </span>
    </div>
  </article>
</template>

<style scoped>
.account-snapshot {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border-color: #ffffff26;
  box-shadow:
    inset 0 1px 0 #ffffff20,
    0 8px 18px -12px #17255480;
}
.account-snapshot--navy {
  background:
    radial-gradient(ellipse at 100% 0%, #45608b80, transparent 70%),
    linear-gradient(120deg, #15243e, #293e63);
}
.account-snapshot--indigo {
  background:
    radial-gradient(ellipse at 100% 0%, #a5b4fc50, transparent 70%),
    linear-gradient(120deg, #3546a0, #5265c4);
}
.account-snapshot--slate {
  background:
    radial-gradient(ellipse at 100% 0%, #b7c9df30, transparent 70%),
    linear-gradient(120deg, #354357, #506278);
}
.account-snapshot::after {
  content: '';
  position: absolute;
  z-index: -1;
  width: 220px;
  height: 220px;
  right: -100px;
  top: -140px;
  border: 1px solid #ffffff12;
  border-radius: 50%;
  box-shadow:
    0 0 0 24px #ffffff04,
    0 0 0 48px #ffffff03;
  pointer-events: none;
}
.snapshot-icon {
  background: #ffffff10;
  box-shadow: inset 0 0 0 1px #ffffff14;
}
</style>
