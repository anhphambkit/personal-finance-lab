import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import ui from '@nuxt/ui/vue-plugin'
import UApp from '@nuxt/ui/components/App.vue'
import { http, HttpResponse } from 'msw'
import { server } from '../../data/mock/server'
import { createSeedState } from '../../data/seed/createSeedState'
import type { SpendingInsight } from '../../domain/spending/spendingInsight'
import SpendingDashboard from '../../features/insights/components/SpendingDashboard.vue'
import SpendingPage from '../../pages/spending-insights.vue'

vi.mock('#app', async () => {
  const router = await import('vue-router')
  const { ref } = await import('vue')
  return {
    useRoute: router.useRoute,
    useRouter: router.useRouter,
    useState: (_key: string, initialize: () => unknown) => ref(initialize()),
  }
})

const insight: SpendingInsight = {
  month: '2026-08',
  totalMinor: '29',
  previousTotalMinor: '58',
  count: 1,
  breakdown: [
    { type: 'CARD', amountMinor: '29', count: 1 },
    { type: 'CASH', amountMinor: '0', count: 0 },
    { type: 'FEE', amountMinor: '0', count: 0 },
  ],
  trend: ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'].map((month) => ({
    month,
    amountMinor: month === '2026-08' ? '29' : month === '2026-07' ? '58' : '0',
    count: month >= '2026-07' ? 1 : 0,
  })),
}
const seed = createSeedState()
const accounts = seed.accounts.filter((account) => account.ownerId === seed.customer.id)
const clients: QueryClient[] = []
let requests: Request[] = []
const recordRequest = ({ request }: { request: Request }) => {
  if (new URL(request.url).pathname.startsWith('/api/')) requests.push(request)
}
const activity = () =>
  HttpResponse.json({
    data: [
      {
        id: 'spending-test',
        accountId: 'account-checking',
        direction: 'DEBIT',
        type: 'CARD',
        amountMinor: 29,
        currency: 'USD',
        status: 'COMPLETED',
        description: 'Purchase',
        occurredAt: '2026-08-15T12:00:00Z',
      },
    ],
    pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
  })
beforeEach(() => {
  requests = []
  server.use(
    http.get('*/api/accounts', () => HttpResponse.json(accounts)),
    http.get('*/api/transactions', activity),
  )
  server.events.on('request:start', recordRequest)
})
afterEach(() => {
  server.events.removeListener('request:start', recordRequest)
  clients.splice(0).forEach((client) => client.clear())
})
async function page(url = '/spending-insights?month=2026-08') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(client)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: SpendingPage }],
  })
  await router.push(url)
  await router.isReady()
  const wrapper = mount(
    defineComponent({ setup: () => () => h(UApp, null, { default: () => h(SpendingPage) }) }),
    {
      attachTo: document.body,
      global: { plugins: [router, ui, [VueQueryPlugin, { queryClient: client }]] },
    },
  )
  return { wrapper, router }
}
function button(wrapper: VueWrapper, label: string) {
  return wrapper.findAll('button').find((item) => item.text() === label)!
}
const transactionRequests = () =>
  requests.filter((request) => new URL(request.url).pathname === '/api/transactions')
const ready = (wrapper: VueWrapper) =>
  vi.waitFor(() => expect(wrapper.find('[aria-label="Spending summary"]').exists()).toBe(true))

describe('Spending dashboard presentation', () => {
  it('renders exact cents, counts, comparison and accessible monthly amounts', () => {
    const wrapper = mount(SpendingDashboard, { props: { insight }, global: { plugins: [ui] } })
    expect(wrapper.get('[aria-label="Spending summary"]').text()).toContain('$0.29')
    expect(wrapper.text()).toContain('1 completed payment')
    expect(wrapper.text()).toContain('50.0% lower than the previous month')
    expect(wrapper.get('[aria-label="Monthly spending amounts"]').findAll('li')).toHaveLength(6)
    expect(wrapper.text()).toContain('Cash withdrawals')
    expect(wrapper.text()).toContain('0 payments')
    expect(wrapper.text()).toContain('including refunds')
  })
  it('preserves aggregate precision and avoids division by zero', async () => {
    const wrapper = mount(SpendingDashboard, {
      props: { insight: { ...insight, totalMinor: '18014398509481982', previousTotalMinor: '0' } },
      global: { plugins: [ui] },
    })
    expect(wrapper.text()).toContain('$180,143,985,094,819.82')
    expect(wrapper.text()).toContain('No spending in the previous month to compare')
    await wrapper.setProps({
      insight: { ...insight, totalMinor: '0', previousTotalMinor: '0', count: 0 },
    })
    expect(wrapper.text()).toContain('No spending this month')
    expect(wrapper.text()).toContain('No change from the previous month')
    expect(wrapper.text()).toContain('0 completed payments')
    expect(wrapper.html()).not.toMatch(/NaN|Infinity/)
  })
  it('forwards attributes, merges ui overrides and supplies each named slot with insight', () => {
    const wrapper = mount(SpendingDashboard, {
      props: { insight, ui: { summary: 'p-2', root: 'space-y-2' } },
      attrs: { 'data-testid': 'custom-insight' },
      slots: {
        summary: ({ insight }: { insight: SpendingInsight }) =>
          h('p', `Custom total ${insight.totalMinor}`),
        trend: ({ insight }: { insight: SpendingInsight }) =>
          h('p', `Trend ${insight.trend.length}`),
        breakdown: ({ insight }: { insight: SpendingInsight }) =>
          h('p', `Types ${insight.breakdown.length}`),
      },
      global: { plugins: [ui] },
    })
    expect(wrapper.attributes('data-testid')).toBe('custom-insight')
    expect(wrapper.get('[aria-label="Spending summary"]').classes()).toContain('p-2')
    expect(wrapper.get('[aria-label="Spending summary"]').classes()).not.toContain('p-5')
    expect(wrapper.text()).toContain('Custom total 29')
    expect(wrapper.text()).toContain('Trend 6')
    expect(wrapper.text()).toContain('Types 3')
    expect(wrapper.text()).not.toContain('Total spent')
  })
})

describe('Spending insights page', () => {
  it('resets unapplied edits even when the URL already contains the default month', async () => {
    const now = new Date()
    const defaultMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
      .toISOString()
      .slice(0, 7)
    const { wrapper, router } = await page(`/spending-insights?month=${defaultMonth}`)
    await ready(wrapper)
    const requestCount = transactionRequests().length
    await wrapper.get('#spending-month').setValue('2025-01')
    wrapper
      .findAllComponents({ name: 'Select' })
      .find((item) => item.props('id') === 'spending-account')!
      .vm.$emit('update:modelValue', 'account-checking')
    await button(wrapper, 'Reset filters').trigger('click')
    expect((wrapper.get('#spending-month').element as HTMLInputElement).value).toBe(defaultMonth)
    expect(
      wrapper
        .findAllComponents({ name: 'Select' })
        .find((item) => item.props('id') === 'spending-account')!
        .props('modelValue'),
    ).toBe('ALL')
    expect(router.currentRoute.value.query).toEqual({ month: defaultMonth })
    expect(transactionRequests()).toHaveLength(requestCount)
  })
  it('loads through read-only HTTP with complete UTC window and hides account numbers', async () => {
    const { wrapper } = await page()
    expect(wrapper.text()).toContain('Loading spending insights')
    await ready(wrapper)
    expect(wrapper.get('[aria-label="Spending summary"]').text()).toContain('$0.29')
    expect(Object.fromEntries(new URL(transactionRequests()[0]!.url).searchParams)).toEqual({
      dateFrom: '2026-03-01',
      dateTo: '2026-08-31',
      direction: 'DEBIT',
      status: 'COMPLETED',
      page: '1',
      pageSize: '100',
    })
    expect(requests.length).toBeGreaterThan(0)
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
    for (const account of accounts) expect(wrapper.html()).not.toContain(account.accountNumber)
  })
  it('applies month/account, restores Back state and resets filters', async () => {
    const { wrapper, router } = await page()
    await ready(wrapper)
    await wrapper.get('#spending-month').setValue('2026-09')
    wrapper
      .findAllComponents({ name: 'Select' })
      .find((item) => item.props('id') === 'spending-account')!
      .vm.$emit('update:modelValue', 'account-checking')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() =>
      expect(router.currentRoute.value.query).toEqual({
        month: '2026-09',
        accountId: 'account-checking',
      }),
    )
    await ready(wrapper)
    expect(new URL(transactionRequests().at(-1)!.url).searchParams.get('accountId')).toBe(
      'account-checking',
    )
    router.back()
    await vi.waitFor(() => expect(router.currentRoute.value.query).toEqual({ month: '2026-08' }))
    expect((wrapper.get('#spending-month').element as HTMLInputElement).value).toBe('2026-08')
    await button(wrapper, 'Reset filters').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.query.accountId).toBeUndefined())
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })
  it.each([
    'month=2026-13',
    'month=2026-08&month=2026-09',
    'month=1999-12',
    'accountId=a&accountId=b',
  ])('blocks transaction fetching for malformed URL %s', async (query) => {
    const { wrapper } = await page(`/spending-insights?${query}`)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Check the filters in this link'))
    expect(transactionRequests()).toHaveLength(0)
    await button(wrapper, 'Clear invalid filters').trigger('click')
    await ready(wrapper)
    expect(transactionRequests().length).toBeGreaterThan(0)
  })
  it('does not fall back to all accounts for an unknown account', async () => {
    const { wrapper } = await page('/spending-insights?month=2026-08&accountId=foreign')
    await vi.waitFor(() => expect(wrapper.text()).toContain('This account is unavailable'))
    expect(transactionRequests()).toHaveLength(0)
    expect(wrapper.find('[aria-label="Spending summary"]').exists()).toBe(false)
    await button(wrapper, 'Reset filters').trigger('click')
    await ready(wrapper)
  })
  it('retries failed reads while preserving the selected URL', async () => {
    server.use(http.get('*/api/transactions', () => new HttpResponse(null, { status: 500 })))
    const { wrapper, router } = await page()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Unable to load spending insights'))
    expect(wrapper.find('[aria-label="Spending summary"]').exists()).toBe(false)
    server.use(http.get('*/api/transactions', activity))
    await button(wrapper, 'Retry').trigger('click')
    await ready(wrapper)
    expect(router.currentRoute.value.query).toEqual({ month: '2026-08' })
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })
})
