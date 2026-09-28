<script setup lang="ts">
import { computed, type VNodeChild } from 'vue'
import type { BadgeProps } from '@nuxt/ui'
import UBadge from '@nuxt/ui/components/Badge.vue'
import type { Transaction } from '@/domain/transactions/transaction'

const props = withDefaults(
  defineProps<{ status: Transaction['status']; size?: BadgeProps['size']; showIcon?: boolean }>(),
  { size: 'md', showIcon: true },
)
const statuses = {
  COMPLETED: {
    label: 'Completed',
    color: 'success',
    icon: 'i-lucide-check',
    class: 'bank-status--success',
  },
  PENDING: {
    label: 'Pending',
    color: 'warning',
    icon: 'i-lucide-clock-3',
    class: 'bank-status--warning',
  },
  FAILED: { label: 'Failed', color: 'error', icon: 'i-lucide-x', class: 'bank-status--error' },
} as const
const presentation = computed(() => statuses[props.status])
defineSlots<{
  default?(props: { status: Transaction['status']; label: string }): VNodeChild
  leading?(props: { status: Transaction['status']; icon: string }): VNodeChild
}>()
</script>

<template>
  <UBadge
    :color="presentation.color"
    :icon="showIcon ? presentation.icon : undefined"
    :size="size"
    variant="soft"
    class="bank-status rounded-full font-semibold"
    :class="[presentation.class, size === 'md' ? 'px-2.5 py-1 text-xs' : undefined]"
  >
    <template v-if="$slots.leading" #leading>
      <slot name="leading" :status="status" :icon="presentation.icon" />
    </template>
    <slot :status="status" :label="presentation.label">{{ presentation.label }}</slot>
  </UBadge>
</template>
