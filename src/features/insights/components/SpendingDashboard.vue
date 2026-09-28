<script setup lang="ts">
import { computed, type VNodeChild } from 'vue'
import { tv } from '@nuxt/ui/utils/tv'
import UIcon from '@nuxt/ui/components/Icon.vue'
import type { SpendingInsight, SpendingType } from '@/domain/spending/spendingInsight'
import MoneyDisplay from '@/shared/components/MoneyDisplay.vue'

type DashboardRegion = 'root' | 'summary' | 'trend' | 'breakdown'
const props = defineProps<{
  insight: SpendingInsight
  ui?: Partial<Record<DashboardRegion, string>>
}>()
interface DashboardScope {
  insight: SpendingInsight
}
defineSlots<{
  summary?(props: DashboardScope): VNodeChild
  trend?(props: DashboardScope): VNodeChild
  breakdown?(props: DashboardScope): VNodeChild
}>()
const styles = tv({
  slots: {
    root: 'min-w-0 space-y-5',
    summary: 'min-w-0 rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-7',
    trend: 'min-w-0 rounded-2xl border border-default bg-default p-5 sm:p-6',
    breakdown: 'min-w-0 rounded-2xl border border-default bg-default p-5 sm:p-6',
  },
})()
const typeLabels: Record<SpendingType, string> = {
  CARD: 'Card payments',
  CASH: 'Cash withdrawals',
  FEE: 'Fees',
}
const typeIcons: Record<SpendingType, string> = {
  CARD: 'i-lucide-credit-card',
  CASH: 'i-lucide-banknote',
  FEE: 'i-lucide-receipt',
}
const total = computed(() => BigInt(props.insight.totalMinor))
const previous = computed(() => BigInt(props.insight.previousTotalMinor))
const comparison = computed(() => {
  if (total.value === previous.value) return 'No change from the previous month'
  if (previous.value === 0n) return 'No spending in the previous month to compare'
  const difference = total.value - previous.value
  const absolute = difference < 0n ? -difference : difference
  const tenths = (absolute * 1000n + previous.value / 2n) / previous.value
  return `${tenths / 10n}.${tenths % 10n}% ${difference > 0n ? 'higher' : 'lower'} than the previous month`
})
const maximum = computed(() =>
  props.insight.trend.reduce((max, item) => {
    const amount = BigInt(item.amountMinor)
    return amount > max ? amount : max
  }, 0n),
)
function percentage(amount: string, denominator: bigint): number {
  if (denominator <= 0n) return 0
  const scaled = (BigInt(amount) * 10_000n) / denominator
  return Number(scaled > 10_000n ? 10_000n : scaled < 0n ? 0n : scaled) / 100
}
function monthLabel(month: string, short = false): string {
  return new Intl.DateTimeFormat('en-US', {
    month: short ? 'short' : 'long',
    ...(short ? {} : { year: 'numeric' as const }),
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00.000Z`))
}
</script>

<template>
  <div :class="styles.root({ class: ui?.root })">
    <section aria-label="Spending summary" :class="styles.summary({ class: ui?.summary })">
      <slot name="summary" :insight="insight">
        <div class="grid min-w-0 gap-6 sm:grid-cols-2 sm:items-center">
          <div class="min-w-0">
            <h2 class="text-sm font-medium text-toned">
              Total spent · {{ monthLabel(insight.month) }}
            </h2>
            <MoneyDisplay
              :amount-minor="total"
              class="mt-3 block text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl"
            />
            <p class="mt-2 text-sm text-muted">
              {{ insight.count }} completed {{ insight.count === 1 ? 'payment' : 'payments' }} · USD
            </p>
          </div>
          <div
            class="min-w-0 border-t border-primary/15 pt-5 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6"
          >
            <p class="text-sm font-medium text-toned">Previous month</p>
            <MoneyDisplay
              :amount-minor="previous"
              class="mt-2 block text-xl font-semibold text-highlighted"
            />
            <p class="mt-2 text-sm text-muted">{{ comparison }}</p>
          </div>
        </div>
        <p v-if="total === 0n" class="mt-5 border-t border-primary/15 pt-4 text-sm text-toned">
          No spending this month. Try another month or account to explore your activity.
        </p>
      </slot>
    </section>

    <p class="text-sm leading-relaxed text-muted">
      Spending includes completed card payments, cash withdrawals and fees. Transfers, credits
      (including refunds), pending and failed transactions are excluded. Months use UTC dates.
    </p>

    <div class="grid min-w-0 gap-5 xl:grid-cols-[1.2fr_1fr]">
      <section aria-label="Six-month spending trend" :class="styles.trend({ class: ui?.trend })">
        <h2 class="text-lg font-semibold text-highlighted">Spending over time</h2>
        <p class="mt-1 text-sm text-muted">Six months ending {{ monthLabel(insight.month) }}</p>
        <slot name="trend" :insight="insight">
          <div
            aria-hidden="true"
            class="mt-6 grid h-36 grid-cols-6 items-end gap-3 border-b border-default px-1"
          >
            <div
              v-for="item in insight.trend"
              :key="item.month"
              class="flex h-full min-w-0 items-end justify-center"
            >
              <div
                class="w-full max-w-12 rounded-t-md"
                :class="item.month === insight.month ? 'bg-primary' : 'bg-primary/35'"
                :style="{ height: `${percentage(item.amountMinor, maximum)}%` }"
              />
            </div>
          </div>
          <div
            aria-hidden="true"
            class="mt-2 grid grid-cols-6 gap-3 text-center text-xs text-muted"
          >
            <span v-for="item in insight.trend" :key="item.month">
              {{ monthLabel(item.month, true) }}
            </span>
          </div>
          <ul
            aria-label="Monthly spending amounts"
            class="mt-6 grid min-w-0 grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3"
          >
            <li v-for="item in insight.trend" :key="item.month" class="min-w-0">
              <p class="text-xs text-muted">{{ monthLabel(item.month) }}</p>
              <MoneyDisplay
                :amount-minor="BigInt(item.amountMinor)"
                class="mt-1 block text-sm font-semibold text-highlighted"
              />
            </li>
          </ul>
        </slot>
      </section>

      <section aria-label="Spending by type" :class="styles.breakdown({ class: ui?.breakdown })">
        <h2 class="text-lg font-semibold text-highlighted">Where your money went</h2>
        <p class="mt-1 text-sm text-muted">Breakdown by transaction type</p>
        <slot name="breakdown" :insight="insight">
          <ul class="mt-6 space-y-6">
            <li v-for="item in insight.breakdown" :key="item.type" class="min-w-0">
              <div class="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div class="flex min-w-0 items-center gap-3">
                  <span
                    class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                  >
                    <UIcon :name="typeIcons[item.type]" class="size-4" aria-hidden="true" />
                  </span>
                  <div class="min-w-0">
                    <h3 class="text-sm font-medium text-highlighted">
                      {{ typeLabels[item.type] }}
                    </h3>
                    <p class="mt-0.5 text-xs text-muted">
                      {{ item.count }} {{ item.count === 1 ? 'payment' : 'payments' }}
                    </p>
                  </div>
                </div>
                <MoneyDisplay
                  :amount-minor="BigInt(item.amountMinor)"
                  class="max-w-full text-sm font-semibold text-highlighted"
                />
              </div>
              <div aria-hidden="true" class="mt-3 h-2 overflow-hidden rounded-full bg-elevated">
                <div
                  class="h-full rounded-full bg-primary"
                  :style="{ width: `${percentage(item.amountMinor, total)}%` }"
                />
              </div>
            </li>
          </ul>
        </slot>
      </section>
    </div>
  </div>
</template>
