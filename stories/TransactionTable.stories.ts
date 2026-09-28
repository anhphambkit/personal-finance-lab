import type { Meta, StoryObj } from '@storybook/vue3-vite'
import TransactionTable from '../src/features/transactions/components/TransactionTable.vue'
import { seed, accounts } from './fixtures'
const meta = {
  title: 'Banking/TransactionTable',
  component: TransactionTable,
  args: {
    accounts,
    transactions: seed.transactions
      .filter((t) => accounts.some((a) => a.id === t.accountId))
      .slice(0, 6),
    variant: 'full',
  },
  argTypes: {
    accounts: { control: 'object' },
    transactions: { control: 'object' },
    variant: { control: 'radio', options: ['full', 'recent'] },
    caption: { control: 'text' },
  },
} satisfies Meta<typeof TransactionTable>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
