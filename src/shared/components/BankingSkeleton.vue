<script setup lang="ts">
import { computed, type VNodeChild } from 'vue'
import USkeleton from '@nuxt/ui/components/Skeleton.vue'
const props = withDefaults(
  defineProps<{
    variant?: 'accounts' | 'transactions' | 'generic'
    count?: number
    showSummary?: boolean
  }>(),
  { variant: 'generic', count: undefined, showSummary: true },
)
const count = computed(() => {
  const fallback = props.variant === 'accounts' ? 3 : props.variant === 'transactions' ? 5 : 2
  return props.count === undefined || !Number.isFinite(props.count)
    ? fallback
    : Math.min(100, Math.max(0, Math.floor(props.count)))
})
defineSlots<{
  summary?(): VNodeChild
  account?(props: { index: number }): VNodeChild
  transaction?(props: { index: number }): VNodeChild
  block?(props: { index: number }): VNodeChild
}>()
</script>

<template>
  <div aria-hidden="true" class="bank-loading-skeleton">
    <template v-if="variant === 'accounts'">
      <slot v-if="showSummary" name="summary">
        <div
          class="bank-summary grid grid-cols-2 gap-5 rounded-3xl border p-5 sm:p-7 md:grid-cols-[1.5fr_1fr_1fr] md:items-center"
        >
          <div class="col-span-2 space-y-4 md:col-span-1">
            <USkeleton class="bank-skeleton h-5 w-36" />
            <USkeleton class="bank-skeleton h-12 w-64 max-w-full" />
            <USkeleton class="bank-skeleton h-5 w-72 max-w-full" />
          </div>
          <div
            v-for="item in 2"
            :key="item"
            class="space-y-3 border-t border-indigo-200/60 pt-5 md:border-t-0 md:border-l md:pt-0 md:pl-6"
          >
            <USkeleton class="bank-skeleton size-9 rounded-xl" />
            <USkeleton class="bank-skeleton h-5 w-32" />
            <USkeleton class="bank-skeleton h-7 w-28" />
          </div>
        </div>
      </slot>
      <div class="mt-6 mb-4 flex h-11 items-center justify-between">
        <USkeleton class="bank-skeleton h-6 w-40" />
        <USkeleton class="bank-skeleton h-5 w-24" />
      </div>
      <div class="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="item in count"
          :key="item"
          class="bank-card-skeleton overflow-hidden rounded-3xl border border-indigo-100"
        >
          <slot name="account" :index="item - 1">
            <div class="space-y-5 p-5 sm:p-6">
              <div class="mb-6 flex justify-between gap-3">
                <USkeleton class="bank-skeleton h-5 w-24" />
                <USkeleton class="bank-skeleton h-6 w-16 rounded-full" />
              </div>
              <USkeleton class="bank-skeleton h-6 w-44 max-w-full" />
              <USkeleton class="bank-skeleton h-10 w-40" />
              <USkeleton class="bank-skeleton h-5 w-28" />
            </div>
            <div class="space-y-4 border-t border-indigo-100/80 p-5 sm:px-6">
              <USkeleton class="bank-skeleton h-7 w-full" />
              <USkeleton class="bank-skeleton h-11 w-full rounded-xl" />
            </div>
          </slot>
        </div>
      </div>
    </template>
    <div
      v-else-if="variant === 'transactions'"
      class="bank-surface overflow-hidden rounded-2xl border border-default bg-default"
    >
      <div
        class="flex h-12 items-center justify-between gap-5 border-b border-default bg-elevated/80 px-5"
      >
        <USkeleton class="bank-skeleton h-3 w-28" />
        <USkeleton class="bank-skeleton h-3 w-20" />
        <USkeleton class="bank-skeleton hidden h-3 w-24 md:block" />
      </div>
      <div
        v-for="item in count"
        :key="item"
        class="flex items-center justify-between gap-5 border-b border-slate-100 px-5 py-5 last:border-0"
      >
        <slot name="transaction" :index="item - 1">
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <USkeleton class="bank-skeleton hidden size-10 shrink-0 rounded-xl sm:block" />
            <div class="w-full space-y-2">
              <USkeleton class="bank-skeleton h-4 max-w-full" :class="item % 2 ? 'w-44' : 'w-32'" />
              <USkeleton class="bank-skeleton h-3 w-24 max-w-full" />
            </div>
          </div>
          <USkeleton class="bank-skeleton hidden h-4 w-24 md:block" />
          <USkeleton class="bank-skeleton hidden h-7 w-24 rounded-full sm:block" />
          <USkeleton class="bank-skeleton h-5 w-20 shrink-0" />
        </slot>
      </div>
    </div>
    <div v-else class="space-y-4">
      <template v-for="item in count" :key="item">
        <slot name="block" :index="item - 1">
          <USkeleton class="bank-skeleton h-24 w-full rounded-2xl" />
        </slot>
      </template>
    </div>
  </div>
</template>
