<script setup lang="ts">
import { computed, type VNodeChild } from 'vue'
import { formatMoney } from '@/shared/utils/formatMoney'
const props = defineProps<{ amountMinor: number | bigint; direction?: 'DEBIT' | 'CREDIT' }>()
const formatted = computed(() => formatMoney(props.amountMinor, props.direction))
const groups = computed(() => formatted.value.split(','))
defineSlots<{
  default?(props: {
    formatted: string
    amountMinor: number | bigint
    direction: 'DEBIT' | 'CREDIT' | undefined
  }): VNodeChild
}>()
</script>
<template>
  <span class="min-w-0 tabular-nums whitespace-normal">
    <slot :formatted="formatted" :amount-minor="amountMinor" :direction="direction">
      <template v-for="(group, index) in groups" :key="index">
        <span class="whitespace-nowrap">{{ group }}{{ index < groups.length - 1 ? ',' : '' }}</span>
        <wbr v-if="index < groups.length - 1" />
      </template>
    </slot>
  </span>
</template>
