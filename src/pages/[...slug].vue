<script setup lang="ts">
definePageMeta({ title: 'Page not found' })
if (import.meta.server) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 404)
}
import UButton from '@nuxt/ui/components/Button.vue'
</script>

<template>
  <section class="py-16">
    <p class="text-sm font-medium text-primary">404</p>
    <h1 class="mt-3 text-3xl font-semibold text-highlighted">Page not found</h1>
    <p class="mt-3 text-base text-muted">
      This page does not exist. Return to your overview to continue.
    </p>
    <UButton to="/" size="lg" class="mt-6">Back to overview</UButton>
  </section>
</template>
