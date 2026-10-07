import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import ui from '@nuxt/ui/vue-plugin'
import UApp from '@nuxt/ui/components/App.vue'
import { IDBFactory } from 'fake-indexeddb'
import { delay, http, HttpResponse } from 'msw'
import { server } from '../../data/mock/server'
import { createBankingHandlers } from '../../data/mock/handlers/banking'
import { createIndexedDbBankingRepository } from '../../data/repositories/indexedDbBankingRepository'
import { createSeedState } from '../../data/seed/createSeedState'
import { executeTransfer } from '../../use-cases/transfers/executeTransfer'
import type { TransferRequest } from '../../contracts/transfers'
import TransferPage from '../../pages/transfer.vue'

let repository: ReturnType<typeof createIndexedDbBankingRepository>
const clients: QueryClient[] = []
beforeEach(() => {
  const factory = new IDBFactory()
  repository = createIndexedDbBankingRepository(() => factory)
  server.use(...createBankingHandlers(repository))
})
afterEach(() => clients.splice(0).forEach((client) => client.clear()))
async function page() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  clients.push(client)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/transfer', component: TransferPage },
      { path: '/accounts', component: { template: '<p>Accounts destination</p>' } },
      { path: '/transactions', component: { template: '<p>Transactions destination</p>' } },
    ],
  })
  await router.push('/transfer')
  await router.isReady()
  const wrapper = mount(
    defineComponent({ setup: () => () => h(UApp, null, { default: () => h(RouterView) }) }),
    {
      attachTo: document.body,
      global: { plugins: [router, ui, [VueQueryPlugin, { queryClient: client }]] },
    },
  )
  await vi.waitFor(() => expect(wrapper.find('form').exists()).toBe(true))
  return { wrapper, client, router }
}
function button(wrapper: VueWrapper, name: string) {
  return wrapper.findAll('button').find((button) => button.text() === name)!
}
async function details(wrapper: VueWrapper, beneficiary?: string, amount = '10.50') {
  wrapper
    .findAllComponents({ name: 'Select' })[0]!
    .vm.$emit('update:modelValue', 'account-checking')
  await wrapper.vm.$nextTick()
  if (beneficiary) {
    wrapper.findComponent({ name: 'RadioGroup' }).vm.$emit('update:modelValue', 'BENEFICIARY')
    await wrapper.vm.$nextTick()
    const recipient = createSeedState().beneficiaries.find((item) => item.id === beneficiary)!
    if (recipient.internalAccountId) {
      await wrapper.get('input[inputmode="numeric"]').setValue(recipient.accountNumber)
      await button(wrapper, 'Check account').trigger('click')
      await vi.waitFor(() => expect(wrapper.text()).toContain('Verified Raksul-bank account'))
    } else {
      wrapper
        .findAllComponents({ name: 'RadioGroup' })[1]!
        .vm.$emit('update:modelValue', 'OTHER_BANK')
      await wrapper.vm.$nextTick()
      wrapper
        .findAllComponents({ name: 'Select' })[1]!
        .vm.$emit('update:modelValue', recipient.bankName)
      await wrapper.get('input[inputmode="numeric"]').setValue(recipient.accountNumber)
      await wrapper.get('input[maxlength="80"]').setValue(recipient.displayName)
    }
  } else {
    wrapper
      .findAllComponents({ name: 'Select' })[1]!
      .vm.$emit('update:modelValue', 'account-savings')
  }
  await wrapper.get('input[inputmode="decimal"]').setValue(amount)
  await wrapper.get('input[maxlength="140"]').setValue('September transfer')
  await wrapper.get('form').trigger('submit')
  await vi.waitFor(() => expect(wrapper.text()).toContain('Review your transfer'))
}

describe('transfer details → review → confirmation → receipt', () => {
  it('stops retrying a conflicting key, persists the conflict on reload and allows checking activity', async () => {
    const calls: TransferRequest[] = []
    server.use(
      http.post('*/api/transfers', async ({ request }) => {
        calls.push((await request.json()) as TransferRequest)
        return HttpResponse.json(
          { error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Different request' } },
          { status: 409 },
        )
      }),
    )
    const { wrapper, router } = await page()
    await details(wrapper)
    await button(wrapper, 'Confirm transfer').trigger('click')
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain('These details conflict with an earlier transfer.'),
    )
    expect(button(wrapper, 'Retry same transfer')).toBeUndefined()
    expect(button(wrapper, 'Confirm transfer')).toBeUndefined()
    expect(button(wrapper, 'Back').attributes('disabled')).toBeUndefined()
    await router.push('/transactions')
    expect(router.currentRoute.value.path).toBe('/transactions')
    await router.push('/transfer')
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain('These details conflict with an earlier transfer.'),
    )
    expect(button(wrapper, 'Confirm transfer')).toBeUndefined()
    expect(wrapper.find('a[href="/transactions"]').text()).toBe('Check transaction activity')
    expect(calls).toHaveLength(1)
    expect((await repository.load()).transfers).toHaveLength(6)
  })
  it('does not submit if the pending request cannot be saved for recovery', async () => {
    const { wrapper } = await page()
    await details(wrapper)
    const before = await repository.load()
    const update = vi.spyOn(repository, 'update')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Recovery storage is full')
    })
    await button(wrapper, 'Confirm transfer').trigger('click')
    expect(wrapper.text()).toContain('Recovery storage is full')
    expect(update).not.toHaveBeenCalled()
    expect(await repository.load()).toEqual(before)
  })

  it.each([undefined, 'beneficiary-alex', 'beneficiary-rent'])(
    'completes %s through HTTP and committed IndexedDB, then refreshes balances and activity',
    async (beneficiary) => {
      const before = await repository.load()
      const update = vi.spyOn(repository, 'update')
      const { wrapper, client } = await page()
      const invalidate = vi.spyOn(client, 'invalidateQueries')
      await details(wrapper, beneficiary)
      expect(update).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('$10.50')
      expect(wrapper.text()).toContain('•••• 4821')
      for (const account of before.accounts)
        expect(wrapper.html()).not.toContain(account.accountNumber)
      const confirm = button(wrapper, 'Confirm transfer')
      await confirm.trigger('click')
      await confirm.trigger('click')
      await vi.waitFor(() => expect(wrapper.text()).toContain('Transfer complete'))
      expect(update).toHaveBeenCalledOnce()
      const after = await repository.load()
      expect(after.accounts[0]!.balanceMinor).toBe(before.accounts[0]!.balanceMinor - 1050)
      const transfer = after.transfers.at(-1)!
      expect(wrapper.text()).toContain(transfer.id)
      expect(wrapper.text()).toContain('September transfer')
      expect(wrapper.get('time').attributes('datetime')).toBe(transfer.completedAt)
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bank'] })
      expect(wrapper.find('a[href="/transactions"]').exists()).toBe(true)
      expect(wrapper.find('a[href="/accounts"]').exists()).toBe(true)
      await button(wrapper, 'Make another transfer').trigger('click')
      expect(wrapper.find('form').exists()).toBe(true)
      expect(wrapper.get<HTMLInputElement>('input[inputmode="decimal"]').element.value).toBe('')
      await repository.reset()
      expect(await repository.load()).toEqual(createSeedState())
    },
  )
  it('lets the user return from review with their form values intact', async () => {
    const { wrapper } = await page()
    await details(wrapper)
    await button(wrapper, 'Back').trigger('click')
    expect(wrapper.get<HTMLInputElement>('input[inputmode="decimal"]').element.value).toBe('10.50')
    expect(wrapper.findAllComponents({ name: 'Select' })[1]!.props('modelValue')).toBe(
      'account-savings',
    )
    expect((await repository.load()).transfers).toHaveLength(6)
  })
  it('rechecks changed funds on confirm and explicitly states that no money moved', async () => {
    const { wrapper } = await page()
    await details(wrapper)
    await repository.update((state) => {
      state.accounts[0]!.balanceMinor = 5
      return state
    })
    const before = await repository.load()
    await button(wrapper, 'Confirm transfer').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('No money moved for this transfer.'))
    expect(wrapper.text()).toContain('insufficient funds')
    expect(wrapper.text()).not.toContain('Transfer complete')
    expect(button(wrapper, 'Back').attributes('disabled')).toBeUndefined()
    expect(await repository.load()).toEqual(before)
    await button(wrapper, 'Back').trigger('click')
    expect(wrapper.text()).toContain('$0.05')
  })
  it('blocks repeat clicks and navigation during submission', async () => {
    const { wrapper, router } = await page()
    await details(wrapper)
    let complete!: () => void
    const gate = new Promise<void>((resolve) => {
      complete = resolve
    })
    server.use(
      http.post('*/api/transfers', async ({ request }) => {
        await gate
        return HttpResponse.json(
          await executeTransfer(repository, (await request.json()) as TransferRequest),
        )
      }),
    )
    await button(wrapper, 'Confirm transfer').trigger('click')
    expect(button(wrapper, 'Confirm transfer').attributes()).toHaveProperty('disabled')
    expect(button(wrapper, 'Back').attributes()).toHaveProperty('disabled')
    await router.push('/accounts')
    expect(router.currentRoute.value.path).toBe('/transfer')
    complete()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Transfer complete'))
  })
  it('recovers a lost success response with the same key and no second debit', async () => {
    const keys: string[] = []
    server.use(
      http.post('*/api/transfers', async ({ request }) => {
        const body = (await request.json()) as TransferRequest
        keys.push(body.idempotencyKey)
        const result = await executeTransfer(repository, body)
        return keys.length === 1 ? HttpResponse.error() : HttpResponse.json(result)
      }),
    )
    const { wrapper, router } = await page()
    const before = await repository.load()
    await details(wrapper)
    await button(wrapper, 'Confirm transfer').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain("couldn't confirm whether money moved"))
    await delay(40)
    expect(keys).toHaveLength(1)
    expect(button(wrapper, 'Back').attributes()).toHaveProperty('disabled')
    await router.push('/accounts')
    expect(router.currentRoute.value.path).toBe('/transfer')
    await button(wrapper, 'Retry same transfer').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Transfer complete'))
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
    const after = await repository.load()
    expect(after.transfers).toHaveLength(before.transfers.length + 1)
    expect(after.accounts[0]!.balanceMinor).toBe(before.accounts[0]!.balanceMinor - 1050)
  })
  it('keeps a confirmed receipt visible even when refreshing accounts fails', async () => {
    const { wrapper } = await page()
    await details(wrapper)
    server.use(http.get('*/api/accounts', () => new HttpResponse(null, { status: 503 })))
    await button(wrapper, 'Confirm transfer').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Transfer complete'))
    expect(wrapper.text()).not.toContain('Unable to load')
  })
})
