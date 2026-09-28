<script setup lang="ts">
import { ref, useId, type VNodeChild } from 'vue'
import { tv } from '@nuxt/ui/utils/tv'
import UButton from '@nuxt/ui/components/Button.vue'
import UIcon from '@nuxt/ui/components/Icon.vue'
import UInput from '@nuxt/ui/components/Input.vue'

type LoginRegion = 'root' | 'header' | 'form' | 'demo'
const props = withDefaults(
  defineProps<{
    showDemoAccounts?: boolean
    busy?: boolean
    error?: string
    ui?: Partial<Record<LoginRegion, string>>
  }>(),
  { busy: false, error: '', showDemoAccounts: true, ui: () => ({}) },
)
const emit = defineEmits<{
  submit: [credentials: { email: string; password: string }]
}>()
defineSlots<{ intro?(): VNodeChild }>()

const email = ref('')
const password = ref('')
const id = useId()
const styles = tv({
  slots: {
    root: 'w-full min-w-0 max-w-md rounded-2xl border border-default bg-default p-6 shadow-sm sm:p-8',
    header: 'mb-7',
    form: 'space-y-5',
    demo: 'mt-7 rounded-xl border border-default bg-muted p-4 text-sm',
  },
})()

function submit() {
  if (props.busy || !email.value.trim() || !password.value) return
  emit('submit', { email: email.value.trim(), password: password.value })
}
</script>

<template>
  <section :class="styles.root({ class: ui?.root })" :aria-labelledby="`${id}-title`">
    <header :class="styles.header({ class: ui?.header })">
      <div class="mb-7 flex items-center gap-2.5 font-semibold tracking-tight text-highlighted">
        <span class="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UIcon name="i-lucide-landmark" class="size-5" aria-hidden="true" />
        </span>
        Personal Finance Lab
      </div>
      <h1 :id="`${id}-title`" class="text-2xl font-semibold tracking-tight text-highlighted">
        Welcome back
      </h1>
      <div class="mt-2 text-sm leading-relaxed text-muted">
        <slot name="intro">Sign in to explore your accounts in this fictional banking demo.</slot>
      </div>
    </header>

    <form
      :class="styles.form({ class: ui?.form })"
      :aria-busy="busy"
      :aria-describedby="error ? `${id}-error` : undefined"
      @submit.prevent="submit"
    >
      <div>
        <label :for="`${id}-email`" class="mb-2 block text-sm font-medium text-highlighted">
          Email
        </label>
        <UInput
          :id="`${id}-email`"
          v-model="email"
          name="email"
          type="email"
          autocomplete="username"
          autocapitalize="none"
          :spellcheck="false"
          required
          :disabled="busy"
          size="lg"
          class="w-full"
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label :for="`${id}-password`" class="mb-2 block text-sm font-medium text-highlighted">
          Password
        </label>
        <UInput
          :id="`${id}-password`"
          v-model="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
          :disabled="busy"
          size="lg"
          class="w-full"
        />
      </div>
      <p
        v-if="error"
        :id="`${id}-error`"
        role="alert"
        class="rounded-lg border border-error/20 bg-error/10 p-3 text-sm text-error"
      >
        {{ error }}
      </p>
      <UButton type="submit" block size="lg" :loading="busy" :disabled="busy">Sign in</UButton>
    </form>

    <aside
      v-if="showDemoAccounts"
      :class="styles.demo({ class: ui?.demo })"
      :aria-labelledby="`${id}-demo-title`"
    >
      <h2 :id="`${id}-demo-title`" class="font-medium text-highlighted">Try a demo account</h2>
      <p class="mt-1 leading-relaxed text-muted">
        Use either fictional account with the password below.
      </p>
      <ul class="mt-3 space-y-1 break-all text-toned">
        <li>taylor@example.com</li>
        <li>alex@example.com</li>
      </ul>
      <p class="mt-3 text-muted">
        Password:
        <code class="font-medium text-toned">DemoBank!2026</code>
      </p>
      <p class="mt-3 text-xs leading-relaxed text-muted">
        Sample data only. No real accounts or money.
      </p>
    </aside>
  </section>
</template>
