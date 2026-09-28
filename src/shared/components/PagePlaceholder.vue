<script setup lang="ts">
import { useId, type VNodeChild } from 'vue'
import UCard from '@nuxt/ui/components/Card.vue'
import UIcon from '@nuxt/ui/components/Icon.vue'

defineProps<{
  title: string
  description: string
  icon: string
  sectionTitle: string
  message: string
}>()
const headingId = `page-heading-${useId()}`
defineSlots<{
  title?(props: { title: string }): VNodeChild
  description?(props: { description: string }): VNodeChild
  actions?(): VNodeChild
  header?(props: { sectionTitle: string }): VNodeChild
  default?(props: { icon: string; message: string }): VNodeChild
  footer?(): VNodeChild
}>()
</script>

<template>
  <section class="py-4 sm:py-6" :aria-labelledby="headingId">
    <div class="mb-8 flex flex-wrap items-start justify-between gap-5 sm:mb-10">
      <div>
        <h1
          :id="headingId"
          class="text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl"
        >
          <slot name="title" :title="title">{{ title }}</slot>
        </h1>
        <p class="mt-3 max-w-xl text-base leading-7 text-muted">
          <slot name="description" :description="description">{{ description }}</slot>
        </p>
      </div>
      <slot name="actions" />
    </div>

    <UCard :ui="{ root: 'shadow-none', header: 'px-6 py-5', body: 'p-6 sm:p-10' }">
      <template #header>
        <h2 class="text-base font-semibold text-highlighted">
          <slot name="header" :section-title="sectionTitle">{{ sectionTitle }}</slot>
        </h2>
      </template>
      <div class="flex min-h-72 flex-col items-center justify-center text-center">
        <slot :icon="icon" :message="message">
          <span
            class="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/5 text-primary"
          >
            <UIcon :name="icon" class="size-6" aria-hidden="true" />
          </span>
          <p class="text-base font-medium text-highlighted">Not available in this preview yet</p>
          <p class="mt-2 max-w-sm text-sm leading-6 text-muted">{{ message }}</p>
        </slot>
      </div>
      <template v-if="$slots.footer" #footer><slot name="footer" /></template>
    </UCard>
  </section>
</template>
