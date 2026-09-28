import type { Meta, StoryObj } from '@storybook/vue3-vite'
import MoneyInput from '../src/shared/components/MoneyInput.vue'

const meta = {
  title: 'Banking/MoneyInput',
  component: MoneyInput,
  args: { modelValue: '10.50', disabled: false },
  argTypes: { modelValue: { control: 'text' }, disabled: { control: 'boolean' } },
} satisfies Meta<typeof MoneyInput>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Invalid: Story = { args: { modelValue: '1.234' } }
