import type { Meta, StoryObj } from '@storybook/vue3-vite'
import AccountCard from '../src/features/accounts/components/AccountCard.vue'
import { accounts } from './fixtures'
const meta = {
  title: 'Banking/AccountCard',
  component: AccountCard,
  args: { account: accounts[0]! },
  argTypes: {
    account: { control: 'object' },
    appearance: { control: 'select', options: ['auto', 'navy', 'indigo', 'slate'] },
    brand: { control: 'text' },
    transferTo: { control: false },
    ui: { control: false },
  },
} satisfies Meta<typeof AccountCard>
export default meta
type Story = StoryObj<typeof meta>
export const Active: Story = {}
export const Frozen: Story = { args: { account: accounts[2]! } }
