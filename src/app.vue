<script setup lang="ts">
import { useHead, useRoute } from '#imports'
const route = useRoute()
useHead(() => ({
  title: `${String(route.meta.title ?? 'Personal banking')} · Raksul-bank`,
}))
</script>

<template>
  <UApp>
    <NuxtLayout><NuxtPage /></NuxtLayout>
  </UApp>
</template>
