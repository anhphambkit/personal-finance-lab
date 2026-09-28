<script setup lang="ts">
import { ref, type VNodeChild } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import UButton from '@nuxt/ui/components/Button.vue'
import UModal from '@nuxt/ui/components/Modal.vue'
import { useBankingContext } from '@/data/api/bankingContext'
import { bankingQueryKeys } from '@/data/api/bankingQueryKeys'
const { api, ready, mocksEnabled } = useBankingContext()
const open = ref(false)
const restored = ref(false)
const client = useQueryClient()
defineSlots<{
  trigger?(props: { open: () => void; disabled: boolean }): VNodeChild
  body?(props: { pending: boolean; error: boolean }): VNodeChild
  actions?(props: { pending: boolean; confirm: () => void; cancel: () => void }): VNodeChild
  success?(): VNodeChild
}>()
const { mutate, isPending, isError, reset } = useMutation({
  mutationFn: () => api.reset(),
  onMutate: async () => {
    restored.value = false
    await client.cancelQueries({ queryKey: bankingQueryKeys.all })
  },
  onSuccess: async () => {
    await client.invalidateQueries({ queryKey: bankingQueryKeys.all })
    open.value = false
    restored.value = true
  },
})
let triggerElement: HTMLElement | null = null
function requestOpen(event?: Event) {
  if (!mocksEnabled || !ready.value || isPending.value) return
  triggerElement =
    event?.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
  reset()
  restored.value = false
  open.value = true
}
function restoreFocus(event: Event) {
  if (triggerElement?.isConnected) {
    event.preventDefault()
    triggerElement.focus()
  }
}
function confirm() {
  if (mocksEnabled && ready.value && open.value && !isPending.value) mutate()
}
function cancel() {
  if (!isPending.value) open.value = false
}
</script>
<template>
  <div v-if="mocksEnabled" class="flex flex-col items-end gap-2">
    <slot name="trigger" :open="requestOpen" :disabled="!ready || isPending">
      <UButton
        color="neutral"
        variant="ghost"
        class="min-h-11"
        icon="i-lucide-rotate-ccw"
        :disabled="!ready || isPending"
        aria-haspopup="dialog"
        :aria-expanded="open"
        @click="requestOpen"
      >
        Reset demo data
      </UButton>
    </slot>
    <UModal
      v-model:open="open"
      title="Reset demo data?"
      description="Restore the original accounts and activity. Changes made in this demo will be removed."
      :dismissible="!isPending"
      :close="!isPending"
      :content="{ onCloseAutoFocus: restoreFocus }"
    >
      <template #body>
        <slot name="body" :pending="isPending" :error="isError">
          <p v-if="isError" role="alert" class="text-sm text-error">
            Demo data could not be reset. Please try again.
          </p>
          <p v-else class="text-sm text-toned">This affects demonstration data only.</p>
        </slot>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-3">
          <slot name="actions" :pending="isPending" :confirm="confirm" :cancel="cancel">
            <UButton color="neutral" variant="outline" :disabled="isPending" @click="cancel">
              Cancel
            </UButton>
            <UButton :loading="isPending" @click="confirm">Reset demo</UButton>
          </slot>
        </div>
      </template>
    </UModal>
    <p v-if="restored" role="status" class="text-sm text-primary">
      <slot name="success">Demo data restored.</slot>
    </p>
  </div>
</template>
