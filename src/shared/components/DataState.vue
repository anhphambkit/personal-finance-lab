<script setup lang="ts">
import type { VNodeChild } from 'vue'
import UButton from '@nuxt/ui/components/Button.vue'
import UIcon from '@nuxt/ui/components/Icon.vue'
import { tv } from '@nuxt/ui/utils/tv'
import BankingSkeleton from './BankingSkeleton.vue'
import { ApiError } from '@/data/api/apiError'

type SkeletonVariant = 'accounts' | 'transactions' | 'generic'
type StateUI = 'root' | 'loading' | 'error' | 'empty' | 'content' | 'refreshing'
const props = withDefaults(
  defineProps<{
    loading: boolean
    refreshing?: boolean
    skeleton?: SkeletonVariant
    error?: unknown
    empty: boolean
    label: string
    emptyMessage: string
    ui?: Partial<Record<StateUI, string>>
  }>(),
  { refreshing: false, skeleton: 'generic', error: undefined, ui: undefined },
)
const emit = defineEmits<{ retry: [] }>()
defineSlots<{
  loading?(props: { label: string; skeleton: SkeletonVariant }): VNodeChild
  error?(props: { error: unknown; label: string; retry: () => void }): VNodeChild
  empty?(props: { label: string; message: string }): VNodeChild
  refreshing?(props: { label: string }): VNodeChild
  default?(props: { refreshing: boolean }): VNodeChild
}>()

const styles = tv({
  slots: {
    loading: '',
    error: 'rounded-xl border border-error/25 bg-error/5 p-6',
    empty: 'rounded-xl border border-default bg-default px-6 py-12 text-center',
    content: 'bank-data-content relative',
    refreshing: 'bank-refresh-indicator',
  },
})()
function retry() {
  emit('retry')
}
</script>

<template>
  <div
    v-if="loading"
    :class="styles.loading({ class: [props.ui?.root, props.ui?.loading] })"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <p class="sr-only">Loading {{ label }}…</p>
    <slot name="loading" :label="label" :skeleton="skeleton">
      <BankingSkeleton :variant="skeleton" />
    </slot>
  </div>
  <div
    v-else-if="error"
    role="alert"
    :class="styles.error({ class: [props.ui?.root, props.ui?.error] })"
  >
    <slot name="error" :error="error" :label="label" :retry="retry">
      <h2 class="text-base font-semibold text-highlighted">Unable to load {{ label }}</h2>
      <p class="mt-2 text-sm text-toned">
        {{
          error instanceof ApiError && error.code === 'STORAGE_UNAVAILABLE'
            ? 'Demo storage is unavailable. Close older tabs if necessary and try again.'
            : 'Please check your connection and try again.'
        }}
      </p>
      <UButton class="mt-4" color="neutral" variant="outline" @click="retry">Try again</UButton>
    </slot>
  </div>
  <div v-else-if="empty" :class="styles.empty({ class: [props.ui?.root, props.ui?.empty] })">
    <slot name="empty" :label="label" :message="emptyMessage">
      <h2 class="text-lg font-semibold text-highlighted">No {{ label }} yet</h2>
      <p class="mt-2 text-sm text-muted">{{ emptyMessage }}</p>
    </slot>
  </div>
  <div
    v-else
    :class="styles.content({ class: [props.ui?.root, props.ui?.content] })"
    :aria-busy="refreshing || undefined"
  >
    <div
      v-if="refreshing"
      :class="styles.refreshing({ class: props.ui?.refreshing })"
      role="status"
      aria-live="polite"
    >
      <slot name="refreshing" :label="label">
        <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" aria-hidden="true" />
        Updating {{ label }}…
      </slot>
    </div>
    <slot :refreshing="refreshing" />
  </div>
</template>
