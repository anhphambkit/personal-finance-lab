import { IDBFactory } from 'fake-indexeddb'
import { server } from '../../data/mock/server'
import { createBankingHandlers } from '../../data/mock/handlers/banking'
import { createIndexedDbBankingRepository } from '../../data/repositories/indexedDbBankingRepository'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import ui from '@nuxt/ui/vue-plugin'
import TransferDetailsForm from '../../features/transfers/components/TransferDetailsForm.vue'
import { createSeedState } from '../../data/seed/createSeedState'
import {
  prepareTransfer,
  type TransferDetails,
  type TransferDraft,
} from '../../features/transfers/transferDraft'
beforeEach(() => {
  const factory = new IDBFactory()
  server.use(...createBankingHandlers(createIndexedDbBankingRepository(() => factory)))
})
const seed = createSeedState()
const accounts = seed.accounts.filter((account) => account.ownerId === seed.customer.id)
const details: TransferDetails = {
  sourceAccountId: 'account-checking',
  recipientType: 'OWN_ACCOUNT',
  destinationId: 'account-savings',
  recipientNetwork: 'SAME_BANK',
  recipientAccountId: '',
  recipientName: '',
  bankName: '',
  amount: '0.29',
  reference: '  Savings  ',
}
function form(initial?: TransferDetails) {
  return mount(TransferDetailsForm, {
    props: { accounts, beneficiaries: seed.beneficiaries, initial },
    attachTo: document.body,
    global: {
      plugins: [
        ui,
        createRouter({ history: createMemoryHistory(), routes: [] }),
        [VueQueryPlugin, { queryClient: new QueryClient() }],
      ],
    },
  })
}

describe('transfer details', () => {
  it('filters saved contacts by network, clears the selection on switching and rejects mismatched drafts', async () => {
    const initial: TransferDetails = {
      ...details,
      recipientType: 'BENEFICIARY',
      savedBeneficiaryId: 'beneficiary-alex',
    }
    const wrapper = form(initial)
    const menu = wrapper.findComponent({ name: 'SelectMenu' })
    expect(menu.props('items').map((item: { value: string }) => item.value)).toEqual([
      'beneficiary-alex',
      'beneficiary-jamie',
    ])
    wrapper
      .findAllComponents({ name: 'RadioGroup' })[1]!
      .vm.$emit('update:modelValue', 'OTHER_BANK')
    await wrapper.vm.$nextTick()
    expect(menu.props('modelValue')).toBeUndefined()
    expect(menu.props('items').map((item: { value: string }) => item.value)).not.toContain(
      'beneficiary-alex',
    )
    const mismatch: TransferDetails = { ...initial, recipientNetwork: 'OTHER_BANK' }
    expect(() => prepareTransfer(mismatch, accounts, seed.beneficiaries)).toThrow(
      'Choose an available saved recipient.',
    )
    expect(form(mismatch).findComponent({ name: 'SelectMenu' }).props('modelValue')).toBeUndefined()
  })
  it.each(['beneficiary-alex', 'beneficiary-rent'])(
    'reviews saved recipient %s without re-entering details and restores the choice',
    async (id) => {
      const initial: TransferDetails = {
        ...details,
        recipientType: 'BENEFICIARY',
        savedBeneficiaryId: id,
        recipientNetwork: id === 'beneficiary-alex' ? 'SAME_BANK' : 'OTHER_BANK',
      }
      const wrapper = form(initial)
      expect(wrapper.findComponent({ name: 'SelectMenu' }).props('modelValue')).toBe(id)
      expect(wrapper.find('input[inputmode="numeric"]').exists()).toBe(false)
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(wrapper.emitted('review')).toHaveLength(1))
      const draft = wrapper.emitted('review')![0]![0] as ReturnType<typeof prepareTransfer>
      expect(draft.request.destination).toEqual({ kind: 'BENEFICIARY', beneficiaryId: id })
      expect(draft.recipient.name).toBe(
        seed.beneficiaries.find((item) => item.id === id)!.displayName,
      )
      expect(form(draft.details).findComponent({ name: 'SelectMenu' }).props('modelValue')).toBe(id)
    },
  )

  it('carries explicit save consent into review and keeps it when returning to details', async () => {
    const wrapper = form({
      ...details,
      recipientType: 'BENEFICIARY',
      recipientNetwork: 'OTHER_BANK',
      destinationId: '',
      recipientAccountId: '987654321012',
      recipientName: 'New Contact',
      bankName: 'Techcombank',
    })
    expect(wrapper.get('[role="checkbox"]').attributes('aria-checked')).toBe('false')
    wrapper.findComponent({ name: 'Checkbox' }).vm.$emit('update:modelValue', true)
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('review')).toHaveLength(1))
    const draft = wrapper.emitted('review')![0]![0] as ReturnType<typeof prepareTransfer>
    expect(draft.request.destination).toMatchObject({
      kind: 'NEW_BENEFICIARY',
      saveRecipient: true,
    })
    expect(form(draft.details).get('[role="checkbox"]').attributes('aria-checked')).toBe('true')
  })
  it('keeps review available so submission can explain invalid fields', async () => {
    const empty = form()
    const emptyReview = empty.findAll('button').find((item) => item.text() === 'Review transfer')!
    expect(emptyReview.attributes()).not.toHaveProperty('disabled')

    const valid = form(details)
    const validReview = valid.findAll('button').find((item) => item.text() === 'Review transfer')!
    expect(validReview.attributes()).not.toHaveProperty('disabled')
  })
  it('emits a validated exact-cent draft only after review, without submitting an API mutation', async () => {
    const wrapper = form(details)
    expect(wrapper.emitted('review')).toBeUndefined()
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.emitted('review')).toHaveLength(1))
    const draft = wrapper.emitted('review')![0]![0] as TransferDraft
    expect(draft.request).toMatchObject({
      amountMinor: 29,
      reference: 'Savings',
      destination: { kind: 'OWN_ACCOUNT', accountId: 'account-savings' },
    })
    expect(draft.request.idempotencyKey).toBeTruthy()
    expect(draft.source.id).toBe('account-checking')
    expect(draft.recipient.name).toBe('Rainy Day Savings')
    expect(wrapper.html()).not.toContain(accounts[0]!.accountNumber)
  })
  it('excludes the source and frozen destination, then shows the same/other bank choice', async () => {
    const wrapper = form(details)
    const selects = wrapper.findAllComponents({ name: 'Select' })
    expect(selects[0]!.props('items')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'account-frozen', disabled: true }),
      ]),
    )
    expect(selects[1]!.props('items')).toEqual([
      expect.objectContaining({ value: 'account-savings' }),
    ])
    wrapper.findComponent({ name: 'RadioGroup' }).vm.$emit('update:modelValue', 'BENEFICIARY')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Someone else')
    expect(wrapper.text()).toContain('Same bank')
    expect(wrapper.text()).toContain('Other bank')
    expect(wrapper.text()).toContain('Check account')
  })
  it.each(['1.005', '0', '99999999', '-2'])(
    'blocks invalid or unaffordable amount %s with an inline error',
    async (amount) => {
      const wrapper = form({ ...details, amount })
      await wrapper.get('form').trigger('submit')
      await vi.waitFor(() => expect(wrapper.text()).toMatch(/exceeds your available|above 0/))
      expect(wrapper.emitted('review')).toBeUndefined()
    },
  )
  it('requires account and recipient and preserves details after returning from review', async () => {
    const empty = form()
    await empty.get('form').trigger('submit')
    await vi.waitFor(() => expect(empty.text()).toContain('Choose a source account.'))
    expect(empty.emitted('review')).toBeUndefined()
    const existing = form(details)
    expect(existing.findAllComponents({ name: 'Select' })[1]!.props('modelValue')).toBe(
      'account-savings',
    )
    expect(existing.get<HTMLInputElement>('input[inputmode="decimal"]').element.value).toBe('0.29')
  })
  it('focuses and describes the invalid amount after review validation', async () => {
    const wrapper = form({ ...details, amount: '999999' })
    await wrapper.get('form').trigger('submit')
    const input = wrapper.get('input[inputmode="decimal"]')
    await vi.waitFor(() => expect(document.activeElement === input.element).toBe(true))
    expect(input.attributes('aria-invalid')).toBe('true')
    const errorId = input.attributes('aria-describedby')!
    expect(document.getElementById(errorId)?.textContent).toContain(
      'exceeds your available balance',
    )
    expect(wrapper.emitted('review')).toBeUndefined()
  })
  it('validates an edited amount on blur without duplicating its message', async () => {
    const wrapper = form({ ...details, amount: '1.005' })
    const input = wrapper.get('input[inputmode="decimal"]')
    await input.trigger('blur')
    await vi.waitFor(() => expect(wrapper.text()).toContain('up to 2 decimal places'))
    expect(
      wrapper
        .findAll('[data-slot="error"]')
        .filter((item) => item.text().includes('up to 2 decimal places')),
    ).toHaveLength(1)
    expect(
      wrapper
        .findAll('button')
        .find((item) => item.text() === 'Review transfer')!
        .attributes(),
    ).not.toHaveProperty('disabled')
  })
  it('keeps account numbers digit-only and preserves leading zeroes', async () => {
    const wrapper = form()
    wrapper.findComponent({ name: 'RadioGroup' }).vm.$emit('update:modelValue', 'BENEFICIARY')
    await wrapper.vm.$nextTick()
    const input = wrapper.get<HTMLInputElement>('input[inputmode="numeric"]')
    await input.setValue('00123456')
    for (const value of ['00123456a', '1e3', '-123', '12.34', '123 456']) {
      await input.setValue(value)
      expect(input.element.value).toBe('00123456')
    }
    await input.setValue('')
    expect(input.element.value).toBe('')
  })
  it('checks a same-bank Account number and locks the verified account name', async () => {
    const wrapper = form()
    wrapper
      .findAllComponents({ name: 'Select' })[0]!
      .vm.$emit('update:modelValue', 'account-checking')
    wrapper.findComponent({ name: 'RadioGroup' }).vm.$emit('update:modelValue', 'BENEFICIARY')
    await wrapper.vm.$nextTick()
    await wrapper.get('input[inputmode="numeric"]').setValue('200000001842')
    await wrapper
      .findAll('button')
      .find((item) => item.text() === 'Check account')!
      .trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Verified Raksul-bank account'))
    expect(wrapper.text()).toContain('Alex Rivera')
    expect(wrapper.text()).not.toContain('Account holder name')
  })
  it('shows one Account number verification message at a time', async () => {
    const wrapper = form()
    wrapper
      .findAllComponents({ name: 'Select' })[0]!
      .vm.$emit('update:modelValue', 'account-checking')
    wrapper.findComponent({ name: 'RadioGroup' }).vm.$emit('update:modelValue', 'BENEFICIARY')
    await wrapper.vm.$nextTick()
    await wrapper.get('input[inputmode="decimal"]').setValue('5')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Enter an account number'))
    expect(
      wrapper
        .findAll('[data-slot="error"]')
        .filter((item) => item.text().toLowerCase().includes('account number')),
    ).toHaveLength(1)
    await wrapper.get('input[inputmode="numeric"]').setValue('123')
    await wrapper
      .findAll('button')
      .find((item) => item.text() === 'Check account')!
      .trigger('click')
    expect(
      wrapper
        .findAll('[data-slot="error"]')
        .filter((item) => item.text().toLowerCase().includes('account number')),
    ).toHaveLength(1)
  })
  it('prepares beneficiary identity from the verified same-bank account', () => {
    const draft = prepareTransfer(
      {
        ...details,
        recipientType: 'BENEFICIARY',
        destinationId: 'beneficiary-alex',
        recipientAccountId: '200000001842',
        recipientName: 'Alex Rivera',
      },
      accounts,
      seed.beneficiaries,
    )
    expect(draft.request.destination).toEqual({
      kind: 'BENEFICIARY',
      beneficiaryId: 'beneficiary-alex',
    })
    expect(draft.recipient).toMatchObject({ name: 'Alex Rivera', bankName: 'Raksul-bank' })
  })
  it('keeps a new external recipient inside the review request without saving it', () => {
    const draft = prepareTransfer(
      {
        ...details,
        recipientType: 'BENEFICIARY',
        recipientNetwork: 'OTHER_BANK',
        recipientAccountId: '987654321012',
        recipientName: 'New Recipient',
        bankName: 'Techcombank',
      },
      accounts,
      seed.beneficiaries,
    )
    expect(draft.request.destination).toEqual({
      kind: 'NEW_BENEFICIARY',
      saveRecipient: false,
      beneficiary: {
        displayName: 'New Recipient',
        bankName: 'Techcombank',
        accountNumber: '987654321012',
        currency: 'USD',
      },
    })
    expect(seed.beneficiaries).toHaveLength(6)
  })
})
