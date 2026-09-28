<script setup lang="ts">
import { computed, watch } from 'vue'
import DataState from '@/shared/components/DataState.vue'
import { useBankingContext } from '@/data/api/bankingContext'
import { navigateTo, useState } from '#app'
import { useHead, useRoute, useRouter } from '#imports'
const route = useRoute()
const router = useRouter()
const isLogin = computed(() => router.currentRoute.value.path === '/login')
const { session, ready } = useBankingContext()
const initialError = useState<unknown>('banking-session-error', () => undefined)
const error = computed(() => session.error.value ?? initialError.value)
async function retrySession() {
  initialError.value = undefined
  await session.changeIdentity()
}
watch(
  () => session.status.value,
  (status) => {
    if (status === 'signed-out' && !isLogin.value) void navigateTo('/login')
  },
)
useHead(() => ({
  title: `${String(route.meta.title ?? 'Personal banking')} · Personal Finance Lab`,
}))
</script>

<template>
  <UApp>
    <NuxtPage v-if="isLogin" />
    <NuxtLayout v-else>
      <p v-if="session.cleanupError.value" role="status" class="mb-4 text-warning">
        {{ session.cleanupError.value }}
      </p>
      <DataState
        v-if="error || !ready"
        :loading="!error && session.status.value !== 'signed-out'"
        :error="error"
        :empty="session.status.value === 'signed-out'"
        label="banking session"
        empty-message="Sign in to access your accounts."
        @retry="retrySession"
      />
      <div v-else :inert="!ready" :aria-busy="!ready">
        <NuxtPage :key="session.generation.value" />
      </div>
    </NuxtLayout>
  </UApp>
</template>
