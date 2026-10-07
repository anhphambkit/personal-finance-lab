import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import ui from '@nuxt/ui/vue-plugin'
import UApp from '@nuxt/ui/components/App.vue'
import { IDBFactory } from 'fake-indexeddb'
import { http, HttpResponse, delay } from 'msw'
import { server } from '../../data/mock/server'
import { createBankingHandlers } from '../../data/mock/handlers/banking'
import { createIndexedDbBankingRepository } from '../../data/repositories/indexedDbBankingRepository'
import { createSeedState } from '../../data/seed/createSeedState'
import TransactionsPage from '../../pages/transactions.vue'

const clients: QueryClient[] = []
let requests: URL[] = []
const recordRequest = ({ request }: { request: Request }) => {
  if (new URL(request.url).pathname === '/api/transactions') requests.push(new URL(request.url))
}
beforeEach(() => {
  requests = []
  const factory = new IDBFactory()
  server.use(...createBankingHandlers(createIndexedDbBankingRepository(() => factory)))
  server.events.on('request:start', recordRequest)
})
afterEach(() => {
  server.events.removeListener('request:start', recordRequest)
  clients.splice(0).forEach((client) => client.clear())
})
async function page(url = '/transactions') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(client)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/transactions', component: TransactionsPage }],
  })
  await router.push(url)
  await router.isReady()
  const wrapper = mount(
    defineComponent({
      setup: () => () => h(UApp, null, { default: () => h(TransactionsPage) }),
    }),
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
function select(wrapper: VueWrapper, id: string, value: string | number) {
  wrapper
    .findAllComponents({ name: 'Select' })
    .find((item) => item.props('id') === id)!
    .vm.$emit('update:modelValue', value)
}
const ready = (wrapper: VueWrapper) =>
  vi.waitFor(() => expect(wrapper.text()).toContain('100 transactions'))

describe('Transaction explorer', () => {
  it('loads real API results, shows signed amounts and limits each page', async () => {
    const { wrapper } = await page()
    expect(wrapper.text()).toContain('Loading transactions')
    await ready(wrapper)
    expect(wrapper.findAll('tbody tr')).toHaveLength(20)
    expect(wrapper.text()).toContain('Page 1 of 5')
    expect(wrapper.text()).toContain('−$39.00')
    expect(wrapper.text()).toContain('Failed')
    expect(wrapper.text()).toContain('Money in')
    expect(button(wrapper, 'Previous').attributes()).toHaveProperty('disabled')
    for (const account of createSeedState().accounts)
      expect(wrapper.html()).not.toContain(account.accountNumber)
  })

  it('submits all filters to HTTP and shows the matching server results', async () => {
    const { wrapper, router } = await page('/transactions?page=3')
    await ready(wrapper)
    await wrapper.get('#transaction-search').setValue('Green basket')
    select(wrapper, 'transaction-account', 'account-checking')
    select(wrapper, 'transaction-direction', 'DEBIT')
    select(wrapper, 'transaction-type', 'CARD')
    select(wrapper, 'transaction-status', 'COMPLETED')
    await wrapper.get('#transaction-date-from').setValue('2026-04-01')
    await wrapper.get('#transaction-date-to').setValue('2026-05-31')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('2 transactions matching your filters'))
    const filters = {
      query: 'Green basket',
      accountId: 'account-checking',
      direction: 'DEBIT',
      type: 'CARD',
      status: 'COMPLETED',
      dateFrom: '2026-04-01',
      dateTo: '2026-05-31',
    }
    expect(router.currentRoute.value.query).toEqual(filters)
    expect(Object.fromEntries(requests.at(-1)!.searchParams)).toEqual({
      ...filters,
      page: '1',
      pageSize: '20',
    })
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(wrapper.get('tbody').text()).toContain('May')
    expect(wrapper.get('tbody').text()).toContain('Apr')
    expect(wrapper.get('tbody').text()).not.toContain('Jun')
  })

  it('keeps current rows visible during refresh and shows skeletons for a new search', async () => {
    const { wrapper, router } = await page()
    await ready(wrapper)
    server.use(
      http.get('*/api/transactions', async () => {
        await delay(120)
        return HttpResponse.json({
          data: [{ ...createSeedState().transactions[0], description: 'Updated transaction' }],
          pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
        })
      }),
    )
    await button(wrapper, 'Refresh').trigger('click')
    expect(wrapper.text()).toContain('Updating transactions')
    expect(wrapper.findAll('tbody tr')).toHaveLength(20)
    expect(button(wrapper, 'Refresh').attributes()).toHaveProperty('disabled')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Updated transaction'))
    expect(wrapper.text()).not.toContain('Updating transactions')
    await router.push('/transactions?query=new-search')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Loading transactions'))
    expect(wrapper.find('.bank-loading-skeleton').exists()).toBe(true)
    expect(wrapper.find('tbody').exists()).toBe(false)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Updated transaction'))
  })

  it('preserves URL state on remount and Back/Forward, resetting page when filters change', async () => {
    const { wrapper, router } = await page('/transactions?pageSize=10')
    await ready(wrapper)
    await button(wrapper, 'Next').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Page 2 of 10'))
    await wrapper.get('#transaction-search').setValue('salary')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('6 transactions matching your filters'))
    expect(router.currentRoute.value.query).toEqual({ pageSize: '10', query: 'salary' })
    router.back()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Page 2 of 10'))
    expect((wrapper.get('#transaction-search').element as HTMLInputElement).value).toBe('')
    router.forward()
    await vi.waitFor(() => expect(wrapper.text()).toContain('6 transactions matching your filters'))
    expect((wrapper.get('#transaction-search').element as HTMLInputElement).value).toBe('salary')
    const url = router.currentRoute.value.fullPath
    wrapper.unmount()
    const reloaded = await page(url)
    await vi.waitFor(() =>
      expect(reloaded.wrapper.text()).toContain('6 transactions matching your filters'),
    )
    expect((reloaded.wrapper.get('#transaction-search').element as HTMLInputElement).value).toBe(
      'salary',
    )
  })

  it('changes page size through HTTP and recovers an out-of-range page', async () => {
    const { wrapper, router } = await page('/transactions?page=999')
    await vi.waitFor(() => expect(wrapper.text()).toContain('This page has no transactions'))
    await button(wrapper, 'Go to first page').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Page 1 of 5'))
    await button(wrapper, 'Next').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Page 2 of 5'))
    select(wrapper, 'transaction-page-size', 50)
    await vi.waitFor(() => expect(wrapper.findAll('tbody tr')).toHaveLength(50))
    expect(router.currentRoute.value.query).toEqual({ pageSize: '50' })
    expect(wrapper.text()).toContain('Page 1 of 2')
    await button(wrapper, 'Next').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Page 2 of 2'))
    expect(button(wrapper, 'Next').attributes()).toHaveProperty('disabled')
  })

  it('distinguishes no matches from an empty dataset and clears unapplied edits', async () => {
    const { wrapper } = await page('/transactions?query=no-such-transaction')
    await vi.waitFor(() => expect(wrapper.text()).toContain('No matching transactions'))
    await button(wrapper, 'Show all transactions').trigger('click')
    await ready(wrapper)
    await wrapper.get('#transaction-search').setValue('unapplied edit')
    await button(wrapper, 'Clear filters').trigger('click')
    expect((wrapper.get('#transaction-search').element as HTMLInputElement).value).toBe('')
    server.use(
      http.get('*/api/transactions', () =>
        HttpResponse.json({
          data: [],
          pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
        }),
      ),
    )
    await button(wrapper, 'Refresh').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('No transactions yet'))
    expect(wrapper.text()).not.toContain('No matching transactions')
  })

  it('rejects reversed date inputs without changing URL or requesting new results', async () => {
    const { wrapper, router } = await page()
    await ready(wrapper)
    const count = requests.length
    await wrapper.get('#transaction-date-from').setValue('2026-06-01')
    await wrapper.get('#transaction-date-to').setValue('2026-04-01')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Start date must be on or before end date',
    )
    expect(router.currentRoute.value.query).toEqual({})
    expect(requests).toHaveLength(count)
  })

  it.each(['page=-1', 'status=UNKNOWN', 'direction=DEBIT&direction=CREDIT', 'dateFrom=2026-02-30'])(
    'explains and clears invalid URL input: %s',
    async (params) => {
      const { wrapper } = await page(`/transactions?${params}`)
      await vi.waitFor(() => expect(wrapper.text()).toContain('Check the filters in this link'))
      expect(requests).toHaveLength(0)
      await button(wrapper, 'Clear invalid filters').trigger('click')
      await ready(wrapper)
    },
  )

  it('shows API error and retry while keeping the selected filters', async () => {
    server.use(http.get('*/api/transactions', () => new HttpResponse(null, { status: 500 })))
    const { wrapper, router } = await page('/transactions?query=salary')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Unable to load transactions'))
    server.resetHandlers()
    const factory = new IDBFactory()
    server.use(...createBankingHandlers(createIndexedDbBankingRepository(() => factory)))
    await button(wrapper, 'Try again').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('6 transactions matching your filters'))
    expect(router.currentRoute.value.query).toEqual({ query: 'salary' })
  })

  it('does not show an older slow response after navigating to a different search', async () => {
    server.use(
      http.get('*/api/transactions', async ({ request }) => {
        const search = new URL(request.url).searchParams.get('query')
        await delay(search === 'slow' ? 150 : 10)
        return HttpResponse.json({
          data: [{ ...createSeedState().transactions[0], description: `${search} result` }],
          pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
        })
      }),
    )
    const { wrapper, router } = await page('/transactions?query=slow')
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    await router.push('/transactions?query=latest')
    await vi.waitFor(() => expect(wrapper.text()).toContain('latest result'))
    await delay(180)
    expect(wrapper.text()).not.toContain('slow result')
  })
})
