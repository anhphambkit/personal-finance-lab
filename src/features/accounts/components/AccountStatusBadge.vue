<script setup lang="ts">
import { computed, type VNodeChild } from 'vue'
import type { BadgeProps } from '@nuxt/ui'
import UBadge from '@nuxt/ui/components/Badge.vue'
import type { Account } from '@/domain/accounts/account'
const props = withDefaults(
  defineProps<{ status: Account['status']; size?: BadgeProps['size']; showIcon?: boolean }>(),
  { size: 'md', showIcon: true },
)
const statuses = {
  ACTIVE: {
    label: 'Active',
    color: 'success',
    icon: 'i-lucide-circle-check',
    class: 'bank-status--success',
  },
  FROZEN: {
    label: 'Frozen',
    color: 'warning',
    icon: 'i-lucide-lock-keyhole',
    class: 'bank-status--warning',
  },
} as const
const presentation = computed(() => statuses[props.status])
defineSlots<{
  default?(props: { status: Account['status']; label: string }): VNodeChild
  leading?(props: { status: Account['status']; icon: string }): VNodeChild
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
