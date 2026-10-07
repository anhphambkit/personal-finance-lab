import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import ui from '@nuxt/ui/vue-plugin'
import UApp from '@nuxt/ui/components/App.vue'
import { http, HttpResponse, delay } from 'msw'
import { server } from '../../data/mock/server'
import { createSeedState } from '../../data/seed/createSeedState'
import AccountsPage from '../../pages/accounts.vue'
import DashboardPage from '../../pages/index.vue'
import MoneyDisplay from '../../shared/components/MoneyDisplay.vue'

const seed = createSeedState()
const accounts = seed.accounts.filter((account) => account.ownerId === seed.customer.id)
const clients: QueryClient[] = []
beforeEach(() => {
  server.use(
    http.get('*/api/accounts', () => HttpResponse.json(accounts)),
    http.get('*/api/transactions', () =>
      HttpResponse.json({
        data: seed.transactions.slice(-5).reverse(),
        pagination: { page: 1, pageSize: 5, totalItems: 100, totalPages: 20 },
      }),
    ),
  )
})
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
})
async function page(component = AccountsPage) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  clients.push(client)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component }],
  })
  await router.push('/')
  await router.isReady()
  return mount(
    defineComponent({ setup: () => () => h(UApp, null, { default: () => h(component) }) }),
    {
      attachTo: document.body,
      global: {
        plugins: [router, ui, [VueQueryPlugin, { queryClient: client }]],
      },
    },
  )
}

describe('Accounts and Overview', () => {
  it('loads through HTTP, masks numbers and explains frozen usability', async () => {
    server.use(
      http.get('*/api/accounts', async () => {
        await delay(40)
        return HttpResponse.json(accounts)
      }),
    )
    const wrapper = await page()
    expect(wrapper.get('[role="status"]').text()).toContain('Loading accounts')
    expect(wrapper.get('[role="status"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.findAll('.bank-card-skeleton')).toHaveLength(3)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Everyday Checking'))
    expect(wrapper.findAll('article')).toHaveLength(3)
    expect(wrapper.get('article').text()).not.toContain('raksul-bank')
    expect(wrapper.text()).toContain('$30,776.05')
    expect(wrapper.text()).toContain('•••• 4821')
    for (const account of seed.accounts) expect(wrapper.html()).not.toContain(account.accountNumber)
    expect(wrapper.text()).not.toContain('Alex Rivera')
    const frozen = wrapper.get('article[aria-label="Travel Reserve"]')
    expect(frozen.text()).toContain('Transfers unavailable')
    expect(frozen.get('button').attributes()).toHaveProperty('disabled')
  })

  it('shows an empty state without a misleading summary', async () => {
    server.use(http.get('*/api/accounts', () => HttpResponse.json([])))
    const wrapper = await page()
    await vi.waitFor(() => expect(wrapper.text()).toContain('No accounts yet'))
    expect(wrapper.text()).not.toContain('Total balance')
  })

  it('keeps accounts visible and disables Refresh while updating balances', async () => {
    const wrapper = await page()
    await vi.waitFor(() => expect(wrapper.findAll('article')).toHaveLength(3))
    server.use(
      http.get('*/api/accounts', async () => {
        await delay(100)
        return HttpResponse.json(accounts.map((account) => ({ ...account, balanceMinor: 100 })))
      }),
    )
    const refresh = wrapper.findAll('button').find((button) => button.text() === 'Refresh')!
    await refresh.trigger('click')
    expect(wrapper.text()).toContain('Updating accounts')
    expect(wrapper.findAll('article')).toHaveLength(3)
    expect(wrapper.text()).toContain('$30,776.05')
    expect(refresh.attributes()).toHaveProperty('disabled')
    expect(wrapper.find('.bank-loading-skeleton').exists()).toBe(false)
    await vi.waitFor(() => expect(wrapper.text()).toContain('$3.00'))
    expect(wrapper.text()).not.toContain('Updating accounts')
    expect(refresh.attributes()).not.toHaveProperty('disabled')
  })

  it('shows an error and recovers when Try again succeeds', async () => {
    server.use(
      http.get('*/api/accounts', () =>
        HttpResponse.json(
          { error: { code: 'STORAGE_UNAVAILABLE', message: 'Unavailable' } },
          { status: 503 },
        ),
      ),
    )
    const wrapper = await page()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Unable to load accounts'))
    expect(wrapper.text()).toContain('Unable to load accounts')
    server.use(http.get('*/api/accounts', () => HttpResponse.json(accounts)))
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Try again')!
      .trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Everyday Checking'))
    expect(wrapper.text()).not.toContain('Unable to load accounts')
  })

  it('shows recent activity with dates, signed amounts and pending/failed status', async () => {
    const wrapper = await page(DashboardPage)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Declined card purchase'))
    expect(wrapper.text()).toContain('Failed')
    expect(wrapper.text()).toContain('Pending')
    expect(wrapper.text()).toContain('UTC')
    expect(wrapper.text()).toContain('−$39.00')
    expect(wrapper.find('a[href="/transactions"]').exists()).toBe(true)
  })

  it('can show recent-activity errors separately from successful account data', async () => {
    server.use(http.get('*/api/transactions', () => new HttpResponse(null, { status: 500 })))
    const wrapper = await page(DashboardPage)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Unable to load transactions'))
    expect(wrapper.text()).toContain('Everyday Checking')
  })

  it('confirms reset, waits for the API and refreshes cached accounts', async () => {
    let restored = false
    const resetRequest = vi.fn(() => {
      restored = true
      return new HttpResponse(null, { status: 204 })
    })
    server.use(
      http.get('*/api/accounts', () =>
        HttpResponse.json(
          restored
            ? accounts
            : accounts.map((account) => ({ ...account, displayName: 'Changed account' })),
        ),
      ),
      http.post('*/api/demo/reset', resetRequest),
    )
    const wrapper = await page()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Changed account'))
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Reset demo data')!
      .trigger('click')
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
    expect(resetRequest).not.toHaveBeenCalled()
    const dialog = document.querySelector('[role="dialog"]')!
    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Reset demo',
    )!
    confirm.click()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Demo data restored.'))
    expect(resetRequest).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('Everyday Checking')
    expect(wrapper.text()).not.toContain('Changed account')
  })

  it('formats cents and aggregate balances without floating-point rounding', () => {
    expect(mount(MoneyDisplay, { props: { amountMinor: 29 } }).text()).toBe('$0.29')
    expect(
      mount(MoneyDisplay, { props: { amountMinor: BigInt(Number.MAX_SAFE_INTEGER) * 2n } }).text(),
    ).toBe('$180,143,985,094,819.82')
  })
})
