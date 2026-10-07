import { beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import ui from '@nuxt/ui/vue-plugin'
import DataState from '@/shared/components/DataState.vue'
import AccountCard from '@/features/accounts/components/AccountCard.vue'
import { createSeedState } from '@/data/seed/createSeedState'
import type { Account } from '@/domain/accounts/account'

let router: Router
beforeEach(async () => {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => h('div') } }],
  })
  await router.push('/')
  await router.isReady()
})
const stateProps = {
  loading: false,
  empty: false,
  label: 'accounts',
  emptyMessage: 'Add an account.',
}
const account = createSeedState().accounts.find((entry) => entry.id === 'account-checking')!
type CardScope = { account: Account; canTransfer: boolean }

describe('DataState customization', () => {
  it('preserves state priority and accessibility while exposing loading, error and empty slots', async () => {
    const failure = new Error('Unavailable')
    const errorSlot = vi.fn(
      ({ error, label, retry }: { error: unknown; label: string; retry: () => void }) => {
        expect(error).toBe(failure)
        return h('button', { onClick: retry }, `Reload ${label}`)
      },
    )
    const wrapper = mount(DataState, {
      props: { ...stateProps, loading: true, error: failure, empty: true, skeleton: 'accounts' },
      global: { plugins: [ui, router] },
      slots: {
        loading: ({ label, skeleton }: { label: string; skeleton: string }) =>
          h('p', `Preparing ${label}: ${skeleton}`),
        error: errorSlot,
        empty: ({ label, message }: { label: string; message: string }) =>
          h('p', `${label}: ${message}`),
        default: () => h('p', 'Account content'),
      },
    })
    expect(wrapper.get('[role="status"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.text()).toContain('Loading accounts')
    expect(wrapper.text()).toContain('Preparing accounts: accounts')
    expect(wrapper.find('.bank-loading-skeleton').exists()).toBe(false)
    expect(errorSlot).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Account content')
    await wrapper.setProps({ loading: false })
    expect(wrapper.get('[role="alert"]').text()).toBe('Reload accounts')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('retry')).toEqual([[]])
    await wrapper.setProps({ error: null })
    expect(wrapper.text()).toBe('accounts: Add an account.')
    await wrapper.setProps({ empty: false })
    expect(wrapper.text()).toBe('Account content')
  })

  it('customizes refreshing without remounting the current content', async () => {
    const wrapper = mount(DataState, {
      props: stateProps,
      global: { plugins: [ui, router] },
      slots: {
        refreshing: ({ label }: { label: string }) => h('span', `Syncing ${label}`),
        default: ({ refreshing }: { refreshing: boolean }) =>
          h('input', { 'aria-label': 'Draft', disabled: refreshing }),
      },
    })
    const input = wrapper.get('input').element
    await wrapper.get('input').setValue('Keep my draft')
    await wrapper.setProps({ refreshing: true })
    expect(wrapper.attributes('aria-busy')).toBe('true')
    expect(wrapper.get('[role="status"]').text()).toBe('Syncing accounts')
    expect(wrapper.get('input').element).toBe(input)
    expect(input.value).toBe('Keep my draft')
    expect(input.disabled).toBe(true)
    await wrapper.setProps({ refreshing: false })
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(input.disabled).toBe(false)
  })

  it('merges root and state classes while forwarding root attributes', () => {
    const wrapper = mount(DataState, {
      props: { ...stateProps, error: new Error('Offline'), ui: { root: 'max-w-lg', error: 'p-2' } },
      attrs: { id: 'account-state' },
      global: { plugins: [ui, router] },
    })
    expect(wrapper.attributes('id')).toBe('account-state')
    expect(wrapper.classes()).toContain('max-w-lg')
    expect(wrapper.classes()).toContain('p-2')
    expect(wrapper.classes()).not.toContain('p-6')
    expect(wrapper.text()).toContain('Unable to load accounts')
  })
})

describe('AccountCard customization', () => {
  it('supports branded appearance and route props without changing frozen availability', async () => {
    const wrapper = mount(AccountCard, {
      props: {
        account,
        brand: 'Business banking',
        appearance: 'indigo',
        transferTo: { path: '/transfer', query: { from: account.id } },
      },
      global: { plugins: [ui, router] },
    })
    expect(wrapper.text()).toContain('Business banking')
    expect(wrapper.text()).not.toContain('raksul-bank')
    expect(wrapper.classes()).toContain('bank-account-card--savings')
    expect(wrapper.get('a').attributes('href')).toBe(`/transfer?from=${account.id}`)
    await wrapper.setProps({ account: { ...account, status: 'FROZEN' } })
    expect(wrapper.classes()).toContain('bank-account-card--savings')
    expect(wrapper.text()).toContain('Frozen')
    expect(wrapper.get('button').attributes()).toHaveProperty('disabled')
    expect(wrapper.find('a').exists()).toBe(false)
    await wrapper.setProps({ appearance: 'auto' })
    expect(wrapper.classes()).toContain('bank-account-card--frozen')
  })

  it('exposes reactive account and availability to header, content and actions slots', async () => {
    const wrapper = mount(AccountCard, {
      props: { account },
      global: { plugins: [ui, router] },
      slots: {
        header: ({ account }: CardScope) => h('strong', `Custom: ${account.displayName}`),
        default: ({ account }: CardScope) => h('p', `Balance in cents: ${account.balanceMinor}`),
        actions: ({ account, canTransfer }: CardScope) =>
          h('button', { disabled: !canTransfer }, `Send from ${account.displayName}`),
      },
    })
    expect(wrapper.text()).toContain(`Custom: ${account.displayName}`)
    expect(wrapper.text()).toContain(`Balance in cents: ${account.balanceMinor}`)
    expect(wrapper.text()).not.toContain('Current balance')
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.get('button').attributes()).not.toHaveProperty('disabled')
    expect(wrapper.text()).toContain('Available for transfers.')
    await wrapper.setProps({
      account: { ...account, displayName: 'Updated account', balanceMinor: 99, status: 'FROZEN' },
    })
    expect(wrapper.text()).toContain('Custom: Updated account')
    expect(wrapper.text()).toContain('Balance in cents: 99')
    expect(wrapper.get('button').text()).toBe('Send from Updated account')
    expect(wrapper.get('button').attributes()).toHaveProperty('disabled')
    expect(wrapper.text()).toContain('Transfers unavailable')
  })

  it('lets the footer replace both the default message and actions', () => {
    const actions = vi.fn(() => h('button', 'Unused action'))
    const wrapper = mount(AccountCard, {
      props: { account, ui: { body: 'p-2 sm:p-3', footer: 'px-2 py-1 sm:px-3' } },
      global: { plugins: [ui, router] },
      slots: {
        footer: ({ account, canTransfer }: CardScope) =>
          h('p', `${account.displayName}: ${canTransfer ? 'Available' : 'Frozen'}`),
        actions,
      },
    })
    expect(wrapper.get('.bank-card-footer').text()).toBe(`${account.displayName}: Available`)
    expect(wrapper.text()).not.toContain('Available for transfers.')
    expect(actions).not.toHaveBeenCalled()
    expect(wrapper.get('.bank-card-footer').classes()).toContain('px-2')
    expect(wrapper.get('.bank-card-footer').classes()).not.toContain('px-5')
    expect(wrapper.get('article > div:nth-child(2)').classes()).not.toContain('p-5')
  })
})
