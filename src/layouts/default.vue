<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from '#app'
import type { NavigationMenuItem } from '@nuxt/ui'
import UButton from '@nuxt/ui/components/Button.vue'
import UDashboardGroup from '@nuxt/ui/components/DashboardGroup.vue'
import UDashboardNavbar from '@nuxt/ui/components/DashboardNavbar.vue'
import UDashboardPanel from '@nuxt/ui/components/DashboardPanel.vue'
import UDashboardSidebar from '@nuxt/ui/components/DashboardSidebar.vue'
import UNavigationMenu from '@nuxt/ui/components/NavigationMenu.vue'

const route = useRoute()
const sidebarOpen = ref(false)
const mainContent = ref<HTMLElement>()
const pageTitle = computed(() => String(route.meta.title ?? 'Personal banking'))
let focusContentOnClose = false
let desktopMedia: MediaQueryList | undefined

function onDesktopChange(event: MediaQueryListEvent) {
  if (event.matches && sidebarOpen.value) {
    focusContentOnClose = true
    sidebarOpen.value = false
  }
}

onMounted(() => {
  desktopMedia = window.matchMedia('(min-width: 1024px)')
  desktopMedia.addEventListener('change', onDesktopChange)
})

onUnmounted(() => desktopMedia?.removeEventListener('change', onDesktopChange))

const navigation = [
  { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: '/', exact: true },
  { label: 'Accounts', icon: 'i-lucide-wallet', to: '/accounts' },
  { label: 'Transactions', icon: 'i-lucide-list-filter', to: '/transactions' },
  { label: 'Spending insights', icon: 'i-lucide-chart-no-axes-combined', to: '/spending-insights' },
  { label: 'Transfer', icon: 'i-lucide-arrow-right-left', to: '/transfer' },
].map((item) => ({
  ...item,
  onSelect: () => closeIfCurrentPage(item.to),
})) satisfies NavigationMenuItem[]

function closeIfCurrentPage(path: string) {
  if (route.path === path) sidebarOpen.value = false
}

function onMenuClose(event: Event) {
  if (!focusContentOnClose) return
  event.preventDefault()
  mainContent.value?.focus({ preventScroll: true })
  focusContentOnClose = false
}

watch(
  () => route.path,
  async () => {
    focusContentOnClose = sidebarOpen.value
    sidebarOpen.value = false
    await nextTick()
    mainContent.value?.scrollTo({ top: 0 })
    // Announce the new page without retaining focus on a hidden mobile navigation link.
    if (!focusContentOnClose) mainContent.value?.focus({ preventScroll: true })
  },
)
</script>

<template>
  <a
    href="#main-content"
    class="sr-only fixed top-3 left-3 z-100 rounded-lg bg-primary px-4 py-3 text-white focus:not-sr-only"
    @click.prevent="mainContent?.focus()"
  >
    Skip to content
  </a>

  <UDashboardGroup unit="rem" :persistent="false">
    <UDashboardSidebar
      id="banking"
      v-model:open="sidebarOpen"
      :default-size="15"
      :min-size="15"
      :max-size="15"
      :auto-close="false"
      :menu="{
        title: 'Banking navigation',
        description: 'Choose a banking page.',
        content: { onCloseAutoFocus: onMenuClose },
      }"
      :ui="{
        root: 'bank-sidebar bg-default',
        header: 'px-5 gap-3',
        body: 'px-3 pt-6',
        footer: 'border-t border-default p-5',
        content: 'w-80 max-w-[calc(100vw-2rem)] bg-default',
      }"
    >
      <template #header>
        <NuxtLink
          to="/"
          aria-label="Raksul-bank overview"
          class="bank-brand flex items-center gap-3"
          @click="closeIfCurrentPage('/')"
        >
          <span
            aria-hidden="true"
            class="flex size-9 shrink-0 items-center justify-center bank-brand-mark rounded-xl bg-primary text-2xl leading-none font-semibold text-white"
          >
            r.
          </span>
          <span class="text-lg font-semibold tracking-tight text-highlighted">raksul-bank</span>
        </NuxtLink>
      </template>

      <p class="px-3 text-xs font-semibold tracking-[0.12em] text-muted uppercase">
        Personal banking
      </p>
      <UNavigationMenu
        :items="navigation"
        orientation="vertical"
        aria-label="Main navigation"
        :ui="{
          list: 'space-y-1.5',
          link: 'bank-nav-link min-h-12 px-3 gap-3 text-sm font-medium rounded-lg',
          linkLeadingIcon: 'size-5',
        }"
      />
    </UDashboardSidebar>

    <UDashboardPanel :ui="{ root: 'bg-[var(--bank-canvas)]', body: 'overflow-hidden p-0 sm:p-0' }">
      <template #header>
        <UDashboardNavbar
          as="header"
          :ui="{ root: 'bg-default px-4 sm:px-6', left: 'min-w-0 gap-3' }"
        >
          <template #toggle>
            <UButton
              icon="i-lucide-menu"
              color="neutral"
              variant="ghost"
              size="xl"
              aria-label="Open navigation"
              :aria-expanded="sidebarOpen"
              class="lg:hidden"
              @click="sidebarOpen = true"
            />
          </template>
          <template #left>
            <nav aria-label="Breadcrumb" class="flex min-w-0 items-center gap-3 text-sm">
              <span class="hidden text-muted sm:inline">Personal banking</span>
              <span aria-hidden="true" class="hidden text-dimmed sm:inline">/</span>
              <span aria-current="page" class="truncate font-medium text-toned">
                {{ pageTitle }}
              </span>
            </nav>
          </template>
          <template #right>
            <ClientOnly>
              <UColorModeButton />
              <template #fallback><span class="size-8" aria-hidden="true" /></template>
            </ClientOnly>
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <main
          id="main-content"
          ref="mainContent"
          tabindex="-1"
          :aria-label="pageTitle"
          class="min-h-0 w-full flex-1 overflow-y-auto focus:outline-none"
        >
          <div class="mx-auto w-full max-w-[1440px] p-4 sm:p-6">
            <slot />
          </div>
        </main>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
