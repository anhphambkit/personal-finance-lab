import { computed } from 'vue'
import { useRoute, useRouter } from '#app'
import type { LocationQueryRaw } from 'vue-router'
import { DEFAULT_PAGE_SIZE, transactionQuerySchema } from '@/data/api/transactionQuerySchema'
import { transactionFilterKeys, type TransactionFiltersValue } from '../transactionFilters'

export function useTransactionRoute() {
  const route = useRoute()
  const router = useRouter()
  const parsed = computed(() => {
    const values: Record<string, unknown> = {}
    for (const key of [...transactionFilterKeys, 'page', 'pageSize']) {
      const value = route.query[key]
      if (value !== undefined && value !== '') values[key] = value
    }
    return transactionQuerySchema.safeParse(values)
  })
  const query = computed(() => (parsed.value.success ? parsed.value.data : undefined))
  const filters = computed(
    () =>
      Object.fromEntries(
        transactionFilterKeys.map((key) => [
          key,
          typeof route.query[key] === 'string' ? route.query[key] : '',
        ]),
      ) as TransactionFiltersValue,
  )
  const hasFilters = computed(() => transactionFilterKeys.some((key) => !!query.value?.[key]))
  function navigate(values: LocationQueryRaw) {
    return router.push({ query: { ...route.query, ...values } })
  }
  /** The default page size stays out of the URL. */
  const pageSizeParam = (pageSize?: number) =>
    pageSize === undefined || pageSize === DEFAULT_PAGE_SIZE ? undefined : String(pageSize)
  // Changing filters returns to page 1 and also repairs a malformed pagination URL.
  function applyFilters(values?: TransactionFiltersValue) {
    return navigate({
      ...Object.fromEntries(
        transactionFilterKeys.map((key) => [key, values?.[key].trim() || undefined]),
      ),
      page: undefined,
      pageSize: pageSizeParam(query.value?.pageSize),
    })
  }
  return {
    query,
    filters,
    hasFilters,
    invalid: computed(() => !parsed.value.success),
    applyFilters,
    clearFilters: () => applyFilters(),
    setPage: (page: number) => navigate({ page: page === 1 ? undefined : String(page) }),
    setPageSize: (pageSize: number) =>
      navigate({ pageSize: pageSizeParam(pageSize), page: undefined }),
  }
}
