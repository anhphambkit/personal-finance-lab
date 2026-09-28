import type { Meta, StoryObj } from '@storybook/vue3-vite'
import MoneyDisplay from '../src/shared/components/MoneyDisplay.vue'

const meta = {
  title: 'Banking/MoneyDisplay',
  component: MoneyDisplay,
  args: { amountMinor: 125050 },
  argTypes: {
    amountMinor: {
      control: { type: 'number', step: 1 },
      description: 'Amount in integer cents; 125050 displays $1,250.50.',
    },
    direction: { control: 'select', options: [undefined, 'DEBIT', 'CREDIT'] },
  },
} satisfies Meta<typeof MoneyDisplay>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
