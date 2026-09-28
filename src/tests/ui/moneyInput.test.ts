import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ui from '@nuxt/ui/vue-plugin'
import MoneyInput from '../../shared/components/MoneyInput.vue'

describe('exact money input', () => {
  it('blocks invalid insertions and allows replacing selected digits', async () => {
    const wrapper = mount(MoneyInput, { global: { plugins: [ui] } })
    const input = wrapper.get('input')
    await input.setValue('12.50')
    input.element.setSelectionRange(5, 5)
    const insert = (data: string) => {
      const event = new InputEvent('beforeinput', {
        data,
        inputType: 'insertText',
        bubbles: true,
        cancelable: true,
      })
      input.element.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(insert('a')).toBe(true)
    expect(insert('3')).toBe(true)
    input.element.setSelectionRange(3, 5)
    expect(insert('29')).toBe(false)
  })
  it('preserves editable decimal text and emits exact cents', async () => {
    const wrapper = mount(MoneyInput, { props: { id: 'amount' }, global: { plugins: [ui] } })
    await wrapper.get('input').setValue('0.29')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['0.29'])
    expect(wrapper.emitted('amount')?.at(-1)).toEqual([29])
    expect(wrapper.get('input').attributes('inputmode')).toBe('decimal')
  })
  it.each(['abc', '1.005', '-1', '+1', '1e3', '1,000', '$12', '1.2.3'])(
    'blocks invalid edit %s and keeps the previous amount',
    async (value) => {
      const wrapper = mount(MoneyInput, { global: { plugins: [ui] } })
      const input = wrapper.get('input')
      await input.setValue('12.50')
      await input.setValue(value)
      expect(input.element.value).toBe('12.50')
      expect(wrapper.emitted('amount')?.at(-1)).toEqual([1250])
    },
  )
  it('allows editing a decimal and clearing the field', async () => {
    const wrapper = mount(MoneyInput, { global: { plugins: [ui] } })
    const input = wrapper.get('input')
    for (const value of ['1', '1.', '1.2', '1.23', '']) {
      await input.setValue(value)
      expect(input.element.value).toBe(value)
    }
    expect(wrapper.emitted('amount')?.at(-1)).toEqual([undefined])
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
  it.each(['0', '90071992547409.92'])(
    'rejects %s without rounding it into money',
    async (value) => {
      const wrapper = mount(MoneyInput, { global: { plugins: [ui] } })
      await wrapper.get('input').setValue(value)
      expect(wrapper.emitted('amount')?.at(-1)).toEqual([undefined])
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
      expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
    },
  )
})
