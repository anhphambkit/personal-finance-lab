import { computed } from 'vue'
import { useRoute, useRouter, useState } from '#app'
import { z } from 'zod'
import type { SpendingQuery } from '@/contracts/insights'
import { SPENDING_MONTH_PATTERN } from '@/domain/spending/aggregateSpending'

const schema = z.object({
  month: z.string().regex(SPENDING_MONTH_PATTERN),
  accountId: z.string().trim().min(1).max(100).optional(),
})

export function useSpendingRoute() {
  const route = useRoute()
  const router = useRouter()
  // Serialize the default with Nuxt so month-boundary hydration uses the SSR value.
  const defaultMonth = useState('spending-default-month', () => {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
      .toISOString()
      .slice(0, 7)
  })
  const parsed = computed(() =>
    schema.safeParse({
      month: route.query.month === undefined ? defaultMonth.value : route.query.month,
      accountId: route.query.accountId,
    }),
  )
  const query = computed<SpendingQuery | undefined>(() =>
    parsed.value.success ? parsed.value.data : undefined,
  )
  function apply(month: string, accountId: string) {
    const candidate = schema.safeParse({ month, accountId: accountId || undefined })
    if (!candidate.success) return false
    void router.push({
      query: { ...route.query, month: candidate.data.month, accountId: candidate.data.accountId },
    })
    return true
  }
  return {
    query,
    defaultMonth,
    invalid: computed(() => !parsed.value.success),
    apply,
    clear: () => router.push({ query: { month: defaultMonth.value } }),
  }
}
