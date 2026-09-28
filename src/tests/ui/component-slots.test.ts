import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, type VNodeChild } from 'vue'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import ui from '@nuxt/ui/vue-plugin'
import UApp from '@nuxt/ui/components/App.vue'
import UBadge from '@nuxt/ui/components/Badge.vue'
import { http, HttpResponse, delay } from 'msw'
import { server } from '@/data/mock/server'
import { createSeedState } from '@/data/seed/createSeedState'
import AccountSummary from '@/features/accounts/components/AccountSummary.vue'
import AccountStatusBadge from '@/features/accounts/components/AccountStatusBadge.vue'
import TransactionStatusBadge from '@/features/transactions/components/TransactionStatusBadge.vue'
import TransactionTable from '@/features/transactions/components/TransactionTable.vue'
import TransactionFilters from '@/features/transactions/components/TransactionFilters.vue'
import TransactionPagination from '@/features/transactions/components/TransactionPagination.vue'
import type { TransactionItemScope } from '@/features/transactions/components/transactionSlots'
import type { TransactionFiltersValue } from '@/features/transactions/transactionFilters'
import RecentTransactions from '@/features/overview/components/RecentTransactions.vue'
import ResetDemoButton from '@/features/demo/components/ResetDemoButton.vue'
import MoneyDisplay from '@/shared/components/MoneyDisplay.vue'
import MaskedAccountNumber from '@/shared/components/MaskedAccountNumber.vue'
import BankingSkeleton from '@/shared/components/BankingSkeleton.vue'
import PagePlaceholder from '@/shared/components/PagePlaceholder.vue'

const seed = createSeedState()
const account = seed.accounts.find((entry) => entry.id === 'account-checking')!
const transaction = seed.transactions.find(
  (entry) => entry.accountId === account.id && entry.status === 'COMPLETED',
)!
let router: Router
const clients: QueryClient[] = []
beforeEach(async () => {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => h('div') } }],
  })
  await router.push('/')
  await router.isReady()
})
afterEach(() => clients.splice(0).forEach((client) => client.clear()))
function appHost(render: () => VNodeChild) {
  return defineComponent({ setup: () => () => h(UApp, null, { default: render }) })
}
function queryPlugins() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  clients.push(client)
  const queryPlugin: [typeof VueQueryPlugin, { queryClient: QueryClient }] = [
    VueQueryPlugin,
    { queryClient: client },
  ]
  return [ui, router, queryPlugin]
}
const filters: TransactionFiltersValue = {
  query: '',
  accountId: '',
  direction: '',
  type: '',
  status: '',
  dateFrom: '',
  dateTo: '',
}

describe('Banking presentation slots', () => {
  it('exposes reactive exact totals, while uncustomized summary metrics retain defaults', async () => {
    const wrapper = mount(AccountSummary, {
      props: { accounts: [{ ...account, balanceMinor: 29 }] },
      global: { plugins: [ui, router] },
      slots: {
        total: ({ total, active, frozen }: { total: bigint; active: bigint; frozen: bigint }) =>
          h('p', `${total}/${active}/${frozen}`),
      },
    })
    expect(wrapper.text()).toContain('29/29/0')
    expect(wrapper.text()).toContain('In active accounts')
    await wrapper.setProps({ accounts: [{ ...account, balanceMinor: 29, status: 'FROZEN' }] })
    expect(wrapper.text()).toContain('29/0/29')
    expect(wrapper.text()).toContain('In frozen accounts')
  })

  it('exposes formatted money and only the masked account number to custom content', async () => {
    const money = mount(MoneyDisplay, {
      props: { amountMinor: 29, direction: 'CREDIT' },
      slots: { default: ({ formatted }: { formatted: string }) => h('strong', formatted) },
    })
    expect(money.get('strong').text()).toBe('+$0.29')
    await money.setProps({ amountMinor: 105, direction: 'DEBIT' })
    expect(money.get('strong').text()).toBe('−$1.05')
    const number = mount(MaskedAccountNumber, {
      props: { accountNumber: account.accountNumber },
      slots: {
        default: (scope: { masked: string }) => {
          expect(Object.keys(scope)).toEqual(['masked'])
          return h('em', scope.masked)
        },
      },
    })
    expect(number.get('em').text()).toBe('•••• 4821')
    expect(number.html()).not.toContain(account.accountNumber)
  })

  it('keeps semantic badge state reactive when overriding labels and leading content', async () => {
    const badge = mount(AccountStatusBadge, {
      props: { status: 'ACTIVE' },
      global: { plugins: [ui, router] },
      slots: {
        default: ({ label }: { label: string }) => `Account: ${label}`,
        leading: () => h('span', '*'),
      },
    })
    expect(badge.text()).toContain('Account: Active')
    expect(badge.findComponent(UBadge).props('color')).toBe('success')
    await badge.setProps({ status: 'FROZEN' })
    expect(badge.text()).toContain('Account: Frozen')
    expect(badge.findComponent(UBadge).props('color')).toBe('warning')
    const status = mount(TransactionStatusBadge, {
      props: { status: 'COMPLETED' },
      global: { plugins: [ui, router] },
      slots: { default: ({ label }: { label: string }) => `Payment: ${label}` },
    })
    expect(status.text()).toBe('Payment: Completed')
    await status.setProps({ status: 'FAILED' })
    expect(status.text()).toBe('Payment: Failed')
    expect(status.findComponent(UBadge).props('color')).toBe('error')
  })

  it('renders custom skeleton items with zero-based indices and preserves aria hiding', async () => {
    const wrapper = mount(BankingSkeleton, {
      props: { variant: 'accounts', count: 2, showSummary: false },
      global: { plugins: [ui, router] },
      slots: {
        account: ({ index }: { index: number }) =>
          h('div', { 'data-item': index }, `Placeholder ${index}`),
        summary: () => h('p', 'Summary placeholder'),
      },
    })
    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.findAll('[data-item]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Placeholder 0')
    expect(wrapper.text()).not.toContain('Summary placeholder')
    await wrapper.setProps({ count: 1, showSummary: true })
    expect(wrapper.findAll('[data-item]')).toHaveLength(1)
    expect(wrapper.text()).toContain('Summary placeholder')
  })

  it('keeps placeholder headings labelled when replacing content and footer', () => {
    const wrapper = mount(PagePlaceholder, {
      props: {
        title: 'Transfer',
        description: 'Move money',
        icon: 'i-lucide-wallet',
        sectionTitle: 'Preview',
        message: 'Coming soon',
      },
      global: { plugins: [ui, router] },
      slots: {
        title: ({ title }: { title: string }) => `${title} workspace`,
        default: ({ message }: { message: string }) => h('p', `Custom: ${message}`),
        footer: () => h('button', 'Read guide'),
      },
    })
    expect(wrapper.get('h1').text()).toBe('Transfer workspace')
    expect(wrapper.attributes('aria-labelledby')).toBe(wrapper.get('h1').attributes('id'))
    expect(wrapper.text()).toContain('Custom: Coming soon')
    expect(wrapper.text()).not.toContain('Not available in this preview yet')
    expect(wrapper.get('button').text()).toBe('Read guide')
  })
})

describe('Transaction composition', () => {
  it('uses each field slot in desktop and mobile, with account context', () => {
    const fields = ['description', 'date', 'account', 'type', 'status', 'amount'] as const
    const slots = Object.fromEntries(
      fields.map((field) => [
        field,
        ({ transaction, account, layout }: TransactionItemScope) =>
          h('span', `${field}:${layout}:${transaction.id}:${account?.displayName}`),
      ]),
    )
    const wrapper = mount(TransactionTable, {
      props: { transactions: [transaction], accounts: [account] },
      global: { plugins: [ui, router] },
      slots,
    })
    for (const field of fields) {
      expect(wrapper.get('tbody').text()).toContain(
        `${field}:table:${transaction.id}:${account.displayName}`,
      )
      expect(wrapper.get('ul').text()).toContain(
        `${field}:mobile:${transaction.id}:${account.displayName}`,
      )
    }
  })

  it('allows desktop columns and the entire mobile item to be replaced independently', () => {
    const wrapper = mount(TransactionTable, {
      props: {
        transactions: [transaction],
        accounts: [account],
        columns: [{ accessorKey: 'description', header: 'Custom description' }],
      },
      global: { plugins: [ui, router] },
      slots: {
        'mobile-item': ({ transaction }: TransactionItemScope) =>
          h('p', `Compact ${transaction.id}`),
      },
    })
    expect(wrapper.findAll('thead th')).toHaveLength(1)
    expect(wrapper.get('thead').text()).toBe('Custom description')
    expect(wrapper.get('ul').text()).toBe(`Compact ${transaction.id}`)
  })

  it('validates custom filter updates and exposes guarded apply/clear callbacks', async () => {
    let actions!: { apply: () => void; clear: () => void }
    let update!: (patch: Partial<TransactionFiltersValue>) => void
    const wrapper = mount(TransactionFilters, {
      props: { filters, accounts: [account] },
      global: { plugins: [ui, router] },
      slots: {
        search: (scope: { draft: TransactionFiltersValue; update: typeof update }) => {
          update = scope.update
          return h('input', {
            'aria-label': 'Custom search',
            value: scope.draft.query,
            onInput: (event: Event) =>
              scope.update({ query: (event.target as HTMLInputElement).value }),
          })
        },
        actions: (scope: typeof actions) => {
          actions = scope
          return h('button', { type: 'button', onClick: scope.apply }, 'Find')
        },
        error: ({ message }: { message: string }) => `Validation: ${message}`,
      },
    })
    await wrapper.get('input[aria-label="Custom search"]').setValue('salary')
    update({ dateFrom: '2026-06-01', dateTo: '2026-05-01' })
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Find')!
      .trigger('click')
    expect(wrapper.emitted('apply')).toBeUndefined()
    expect(wrapper.get('[role="alert"]').text()).toContain('Validation: Start date')
    update({ dateFrom: '', dateTo: '' })
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Find')!
      .trigger('click')
    expect(wrapper.emitted('apply')).toEqual([[{ ...filters, query: 'salary' }]])
    await wrapper.setProps({ busy: true })
    actions.apply()
    expect(wrapper.emitted('apply')).toHaveLength(1)
    actions.clear()
    expect(wrapper.emitted('clear')).toEqual([[]])
  })

  it('blocks busy and out-of-range pagination requests from custom controls', async () => {
    let controls!: { setPage: (page: number) => void }
    let pageSize!: { setPageSize: (size: number) => void }
    const wrapper = mount(TransactionPagination, {
      props: {
        pagination: { page: 1, pageSize: 20, totalPages: 3, totalItems: 60 },
        busy: false,
        pageSizes: [10, 20, 50],
      },
      global: { plugins: [ui, router] },
      slots: {
        controls: (scope: typeof controls) => {
          controls = scope
          return h('button', 'Custom next')
        },
        'page-size': (scope: typeof pageSize) => {
          pageSize = scope
          return h('span', 'Custom size')
        },
      },
    })
    controls.setPage(0)
    controls.setPage(4)
    controls.setPage(1.5)
    expect(wrapper.emitted('page')).toBeUndefined()
    controls.setPage(2)
    expect(wrapper.emitted('page')).toEqual([[2]])
    pageSize.setPageSize(999)
    pageSize.setPageSize(50)
    expect(wrapper.emitted('pageSize')).toEqual([[50]])
    await wrapper.setProps({ busy: true })
    controls.setPage(3)
    pageSize.setPageSize(10)
    expect(wrapper.emitted('page')).toHaveLength(1)
    expect(wrapper.emitted('pageSize')).toHaveLength(1)
  })

  it('forwards changing recent-activity slots and refetches when its limit changes', async () => {
    const requests: number[] = []
    server.use(
      http.get('*/api/transactions', async ({ request }) => {
        requests.push(Number(new URL(request.url).searchParams.get('pageSize')))
        await delay(20)
        return HttpResponse.json({
          data: [transaction],
          pagination: { page: 1, pageSize: requests.at(-1), totalPages: 1, totalItems: 1 },
        })
      }),
    )
    const custom = ref(true)
    const limit = ref(2)
    const Host = appHost(() =>
      h(
        RecentTransactions,
        { accounts: [account], limit: limit.value },
        {
          loading: () => h('p', 'Custom loading'),
          ...(custom.value
            ? {
                status: ({ layout }: TransactionItemScope) =>
                  h('strong', `Custom status ${layout}`),
              }
            : {}),
        },
      ),
    )
    const wrapper = mount(Host, { global: { plugins: queryPlugins() } })
    expect(wrapper.text()).toContain('Custom loading')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Custom status table'))
    expect(wrapper.text()).toContain('Custom status mobile')
    custom.value = false
    await vi.waitFor(() => expect(wrapper.text()).not.toContain('Custom status'))
    expect(wrapper.text()).toContain('Completed')
    limit.value = 3
    await vi.waitFor(() => expect(requests).toEqual([2, 3]))
    await vi.waitFor(() => expect(wrapper.text()).toContain('Completed'))
  })
})

describe('Reset demo composition', () => {
  it('keeps custom trigger/actions behind confirmation and prevents duplicate pending resets', async () => {
    const reset = vi.fn(async () => {
      await delay(100)
      return new HttpResponse(null, { status: 204 })
    })
    server.use(http.post('*/api/demo/reset', reset))
    const Host = appHost(() =>
      h(ResetDemoButton, null, {
        trigger: ({ open, disabled }: { open: () => void; disabled: boolean }) =>
          h('button', { disabled, onClick: open }, 'Custom reset'),
        actions: ({ confirm, cancel }: { confirm: () => void; cancel: () => void }) =>
          h(
            'button',
            {
              onClick: () => {
                confirm()
                confirm()
                cancel()
              },
            },
            'Confirm once',
          ),
        success: () => 'Custom reset complete',
      }),
    )
    const wrapper = mount(Host, { attachTo: document.body, global: { plugins: queryPlugins() } })
    await wrapper.get('button').trigger('click')
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
    expect(reset).not.toHaveBeenCalled()
    const dialog = document.querySelector('[role="dialog"]')!
    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent === 'Confirm once',
    )!
    confirm.click()
    await vi.waitFor(() => expect(reset).toHaveBeenCalledOnce())
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Custom reset complete'))
    expect(reset).toHaveBeenCalledOnce()
  })
})
