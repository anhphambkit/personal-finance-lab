<script setup lang="ts">
import { computed, type VNodeChild } from 'vue'
import { maskAccountNumber } from '@/domain/accounts/maskAccountNumber'
const props = defineProps<{ accountNumber: string }>()
const masked = computed(() => maskAccountNumber(props.accountNumber))
defineSlots<{ default?(props: { masked: string }): VNodeChild }>()
</script>
<template>
  <span class="font-mono tracking-wide">
    <slot :masked="masked">{{ masked }}</slot>
  </span>
</template>
