<script setup lang="ts">
import { computed, type VNodeChild } from 'vue'
import UButton from '@nuxt/ui/components/Button.vue'
import USelect from '@nuxt/ui/components/Select.vue'
import type { Pagination } from '@/contracts/pagination'
const props = withDefaults(
  defineProps<{ pagination: Pagination; busy: boolean; pageSizes?: number[]; selectId?: string }>(),
  {
    pageSizes: () => [10, 20, 50, 100],
    selectId: 'transaction-page-size',
  },
)
const emit = defineEmits<{ page: [page: number]; pageSize: [pageSize: number] }>()
const sizes = computed(() =>
  [...new Set([...props.pageSizes, props.pagination.pageSize])]
    .filter((size) => Number.isInteger(size) && size > 0 && size <= 100)
    .sort((a, b) => a - b),
)
const canPrevious = computed(() => !props.busy && props.pagination.page > 1)
const canNext = computed(() => !props.busy && props.pagination.page < props.pagination.totalPages)
function setPage(page: number) {
  if (
    !props.busy &&
    Number.isInteger(page) &&
    page >= 1 &&
    page <= props.pagination.totalPages &&
    page !== props.pagination.page
  )
    emit('page', page)
}
function setPageSize(size: number) {
  if (!props.busy && sizes.value.includes(size) && size !== props.pagination.pageSize)
    emit('pageSize', size)
}
interface PaginationScope {
  pagination: Pagination
  busy: boolean
}
defineSlots<{
  'page-size'?(
    props: PaginationScope & { sizes: number[]; setPageSize: (size: number) => void },
  ): VNodeChild
  summary?(props: PaginationScope): VNodeChild
  controls?(
    props: PaginationScope & {
      canPrevious: boolean
      canNext: boolean
      setPage: (page: number) => void
    },
  ): VNodeChild
}>()
</script>
<template>
  <nav
    aria-label="Transaction pagination"
    class="mt-4 flex flex-wrap items-center justify-between gap-4"
  >
    <div class="flex items-center gap-3">
      <slot
        name="page-size"
        :pagination="pagination"
        :busy="busy"
        :sizes="sizes"
        :set-page-size="setPageSize"
      >
        <label :for="selectId" class="text-sm text-muted">Rows per page</label>
        <USelect
          :id="selectId"
          :model-value="pagination.pageSize"
          :items="sizes"
          :disabled="busy"
          class="min-w-20"
          @update:model-value="setPageSize"
        />
      </slot>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <slot name="summary" :pagination="pagination" :busy="busy">
        <p class="text-sm text-muted">
          Page {{ pagination.page }} of {{ Math.max(1, pagination.totalPages) }}
        </p>
      </slot>
      <slot
        name="controls"
        :pagination="pagination"
        :busy="busy"
        :can-previous="canPrevious"
        :can-next="canNext"
        :set-page="setPage"
      >
        <UButton
          color="neutral"
          variant="outline"
          class="min-h-11"
          :disabled="!canPrevious"
          @click="setPage(pagination.page - 1)"
        >
          Previous
        </UButton>
        <UButton
          color="neutral"
          variant="outline"
          class="min-h-11"
          :disabled="!canNext"
          @click="setPage(pagination.page + 1)"
        >
          Next
        </UButton>
      </slot>
    </div>
  </nav>
</template>
