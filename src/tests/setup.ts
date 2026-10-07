import { vi } from 'vitest'
import { config } from '@vue/test-utils'
import { ref } from 'vue'
import { bankingContextKey } from '@/data/api/bankingContext'
import { createBankingApi } from '@/data/api/bankingApi'

vi.stubGlobal('definePageMeta', () => {})
config.global.provide = {
  [bankingContextKey as symbol]: { api: createBankingApi(), ready: ref(true) },
}
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import { server } from '@/data/mock/server'

enableAutoUnmount(afterEach)
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

beforeEach(() => localStorage.clear())
