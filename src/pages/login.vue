<script setup lang="ts">
import { navigateTo, useNuxtApp, useRoute, useRuntimeConfig } from '#app'
import LoginForm from '@/features/auth/components/LoginForm.vue'
import type { LoginCredentials } from '@/contracts/auth'

definePageMeta({ layout: false, title: 'Sign in' })
const { $auth } = useNuxtApp()
const route = useRoute()
const runtime = useRuntimeConfig()
const showDemoAccounts = String(runtime.public.enableBff) === 'true'
async function signIn(credentials: LoginCredentials) {
  if (!(await $auth.login(credentials))) return
  const target = route.query.returnTo
  const safe =
    typeof target === 'string' &&
    /^\/(?!\/)/.test(target) &&
    !target.includes('\\') &&
    !target.startsWith('/login')
  await navigateTo(safe ? target : '/')
}
</script>

<template>
  <main class="flex min-h-dvh items-center justify-center bg-elevated px-4 py-12">
    <div class="fixed top-4 right-4">
      <ClientOnly><UColorModeButton /></ClientOnly>
    </div>
    <div class="w-full max-w-md">
      <div
        v-if="$auth.logoutPending.value"
        class="mb-4 rounded-xl border border-warning p-4"
        role="alert"
      >
        <p class="mb-3 text-sm">
          Sign out has not been confirmed. Retry to close the server session.
        </p>
        <UButton color="neutral" :loading="$auth.busy.value" @click="$auth.logout()">
          Retry sign out
        </UButton>
      </div>
      <LoginForm
        :show-demo-accounts="showDemoAccounts"
        :busy="$auth.busy.value"
        :error="$auth.error.value"
        @submit="signIn"
      />
    </div>
  </main>
</template>
