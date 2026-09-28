import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ui from '@nuxt/ui/vue-plugin'
import TransactionDetail from '@/features/transactions/components/TransactionDetail.vue'
import { createSeedState } from '@/data/seed/createSeedState'

const seed = createSeedState()
const account = seed.accounts[0]!
const transaction = seed.transactions.find(
  (entry) => entry.accountId === account.id && entry.transferId,
)!

describe('transaction details', () => {
  it('shows exact signed activity, full UTC timestamp, related IDs and only a masked account number', () => {
    const wrapper = mount(TransactionDetail, {
      props: { account, transaction: { ...transaction, amountMinor: 29, direction: 'DEBIT' } },
      global: { plugins: [ui] },
    })
    expect(wrapper.text()).toContain('−$0.29')
    expect(wrapper.text()).toContain('Debit')
    expect(wrapper.text()).toContain('Completed')
    expect(wrapper.text()).toContain(transaction.description)
    expect(wrapper.text()).toContain(transaction.counterparty)
    expect(wrapper.text()).toContain(transaction.id)
    expect(wrapper.text()).toContain(transaction.transferId)
    expect(wrapper.get('time').attributes('datetime')).toBe(transaction.occurredAt)
    expect(wrapper.get('time').text()).toContain('UTC')
    expect(wrapper.text()).toContain(account.displayName)
    expect(wrapper.text()).toContain(account.accountNumber.slice(-4))
    expect(wrapper.html()).not.toContain(account.accountNumber)
  })

  it('handles an unavailable account and missing optional fields without inventing data', () => {
    const { transferId: _transferId, counterparty: _counterparty, ...entry } = transaction
    void _transferId
    void _counterparty
    const wrapper = mount(TransactionDetail, {
      props: { transaction: { ...entry, status: 'PENDING', direction: 'CREDIT' } },
      global: { plugins: [ui] },
    })
    expect(wrapper.text()).toContain('Account unavailable')
    expect(wrapper.text()).toContain('Not provided')
    expect(wrapper.text()).toContain('Pending')
    expect(wrapper.text()).toContain('Credit')
    expect(wrapper.text()).not.toContain('Transfer ID')
  })
})
