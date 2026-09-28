import type { Meta, StoryObj } from '@storybook/vue3-vite'
import TransferReceipt from '../src/features/transfers/components/TransferReceipt.vue'
import { draft, receipt } from './fixtures'
const meta = {
  title: 'Banking/TransferReceipt',
  component: TransferReceipt,
  args: { receipt, recipient: draft.recipient },
  argTypes: { receipt: { control: 'object' }, recipient: { control: 'object' } },
} satisfies Meta<typeof TransferReceipt>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
