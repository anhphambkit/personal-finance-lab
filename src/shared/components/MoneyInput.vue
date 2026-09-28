<script setup lang="ts">
import { computed, useId } from 'vue'
import UInput from '@nuxt/ui/components/Input.vue'
import { decimalToMinor, assertAmountMinor } from '@/domain/money/money'
import { strictNumericInput } from '@/shared/strictNumericInput'
const props = withDefaults(
  defineProps<{ id?: string; disabled?: boolean; showError?: boolean }>(),
  {
    id: undefined,
    disabled: false,
    showError: true,
  },
)
const model = defineModel<string>({ default: '' })
const numericInput = strictNumericInput(/^\d*(?:\.\d{0,2})?$/, () => model.value)
const emit = defineEmits<{ amount: [value: number | undefined] }>()
const fallbackId = useId()
const inputId = computed(() => props.id ?? fallbackId)
const error = computed(() => {
  if (!model.value) return ''
  try {
    assertAmountMinor(decimalToMinor(model.value))
    return ''
  } catch {
    return 'Enter an amount above 0 with up to 2 decimal places.'
  }
})
function update(value: string | number) {
  model.value = String(value)
  try {
    const amount = decimalToMinor(model.value)
    assertAmountMinor(amount)
    emit('amount', amount)
  } catch {
    emit('amount', undefined)
  }
}
</script>
<template>
  <div class="space-y-2">
    <UInput
      :id="inputId"
      :model-value="model"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      placeholder="0.00"
      :disabled="disabled"
      :aria-invalid="props.showError && error ? true : undefined"
      :aria-describedby="props.showError && error ? `${inputId}-error` : undefined"
      class="w-full"
      @beforeinput="numericInput.beforeinput"
      @input.capture="numericInput.input"
      @update:model-value="update"
    >
      <template #leading><span class="text-muted">$</span></template>
      <template #trailing><span class="text-xs text-muted">USD</span></template>
    </UInput>
    <p
      v-if="props.showError && error"
      :id="`${inputId}-error`"
      role="alert"
      class="text-sm text-error"
    >
      {{ error }}
    </p>
  </div>
</template>
