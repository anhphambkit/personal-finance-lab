import { defineNuxtRouteMiddleware, navigateTo, useNuxtApp } from '#app'

export default defineNuxtRouteMiddleware((to) => {
  const app = useNuxtApp()
  const { session } = app.$banking
  if (app.$banking.mocksEnabled) {
    if (to.path === '/login') return navigateTo('/')
    return
  }
  if (to.path === '/login') {
    if (session.userId.value) return navigateTo('/')
    return
  }
  if (
    session.status.value === 'signed-out' ||
    (!session.userId.value && !session.error.value && !app.$bankingSessionError.value)
  ) {
    return navigateTo({ path: '/login', query: { returnTo: to.fullPath } })
  }
})
