<script setup lang="ts">
import { computed, type VNodeChild } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import UButton from '@nuxt/ui/components/Button.vue'
import UIcon from '@nuxt/ui/components/Icon.vue'
import { tv } from '@nuxt/ui/utils/tv'
import type { Account } from '@/domain/accounts/account'
import MoneyDisplay from '@/shared/components/MoneyDisplay.vue'
import MaskedAccountNumber from '@/shared/components/MaskedAccountNumber.vue'
import AccountStatusBadge from './AccountStatusBadge.vue'

type CardAppearance = 'auto' | 'navy' | 'indigo' | 'slate'
type CardUI = 'root' | 'body' | 'header' | 'footer' | 'actions'
interface CardSlotProps {
  account: Account
  canTransfer: boolean
}
const props = withDefaults(
  defineProps<{
    account: Account
    appearance?: CardAppearance
    brand?: string
    transferTo?: RouteLocationRaw
    ui?: Partial<Record<CardUI, string>>
  }>(),
  { appearance: 'auto', brand: '', transferTo: '/transfer', ui: undefined },
)
defineSlots<{
  header?(props: CardSlotProps): VNodeChild
  default?(props: CardSlotProps): VNodeChild
  footer?(props: CardSlotProps): VNodeChild
  actions?(props: CardSlotProps): VNodeChild
}>()

const canTransfer = computed(() => props.account.status === 'ACTIVE')
const slotProps = computed(() => ({ account: props.account, canTransfer: canTransfer.value }))
const appearance = computed(() => {
  if (props.appearance !== 'auto') return props.appearance
  if (props.account.status === 'FROZEN') return 'slate'
  return props.account.type === 'SAVINGS' ? 'indigo' : 'navy'
})
const theme = tv({
  slots: {
    root: 'bank-account-card',
    body: 'relative flex flex-1 flex-col p-5 sm:p-6',
    header: 'flex items-center justify-between gap-3',
    footer: 'bank-card-footer relative px-5 py-4 sm:px-6',
    actions: 'mt-3',
  },
  variants: {
    appearance: {
      navy: { root: 'bank-account-card--checking' },
      indigo: { root: 'bank-account-card--savings' },
      slate: { root: 'bank-account-card--frozen' },
    },
  },
})
const styles = computed(() => theme({ appearance: appearance.value }))
</script>

<template>
  <article :aria-label="account.displayName" :class="styles.root({ class: props.ui?.root })">
    <div class="bank-card-art" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
    <div :class="styles.body({ class: props.ui?.body })">
      <div :class="styles.header({ class: props.ui?.header })">
        <slot name="header" v-bind="slotProps">
          <span v-if="brand" class="text-sm font-semibold tracking-tight text-white/90">
            {{ brand }}
          </span>
          <div v-else class="flex items-center gap-2 text-white/75">
            <UIcon
              :name="account.type === 'CHECKING' ? 'i-lucide-wallet' : 'i-lucide-vault'"
              class="size-4 shrink-0"
              aria-hidden="true"
            />
            <p class="text-xs font-medium tracking-wide">
              {{ account.type === 'CHECKING' ? 'Checking' : 'Savings' }} · {{ account.currency }}
            </p>
          </div>
          <AccountStatusBadge :status="account.status" />
        </slot>
      </div>
      <slot v-bind="slotProps">
        <p v-if="brand" class="mt-6 text-xs text-white/75">
          {{ account.type === 'CHECKING' ? 'Checking' : 'Savings' }} · {{ account.currency }}
        </p>
        <h3 class="mt-5 text-lg font-medium tracking-tight text-white">
          {{ account.displayName }}
        </h3>
        <p class="mt-5 text-xs text-white/75">Current balance</p>
        <MoneyDisplay
          :amount-minor="account.balanceMinor"
          class="mt-1 text-3xl font-semibold tracking-tight text-white"
        />
        <div class="mt-6 flex items-center justify-between gap-3">
          <MaskedAccountNumber
            :account-number="account.accountNumber"
            class="text-sm text-white/90"
          />
          <UIcon name="i-lucide-landmark" class="size-5 text-white/60" aria-hidden="true" />
        </div>
      </slot>
    </div>
    <div :class="styles.footer({ class: props.ui?.footer })">
      <slot name="footer" v-bind="slotProps">
        <p class="min-h-8 text-xs leading-4 text-white/80">
          {{
            canTransfer
              ? 'Available for transfers.'
              : 'Transfers unavailable while this account is frozen.'
          }}
        </p>
        <div :class="styles.actions({ class: props.ui?.actions })">
          <slot name="actions" v-bind="slotProps">
            <UButton
              :to="canTransfer ? transferTo : undefined"
              :disabled="!canTransfer"
              color="neutral"
              variant="ghost"
              class="bank-card-transfer min-h-11 w-full justify-center rounded-xl"
              :trailing-icon="canTransfer ? 'i-lucide-arrow-up-right' : 'i-lucide-lock-keyhole'"
            >
              Transfer
            </UButton>
          </slot>
        </div>
      </slot>
    </div>
  </article>
</template>
