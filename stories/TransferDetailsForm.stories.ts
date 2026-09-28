import type { Meta, StoryObj } from '@storybook/vue3-vite'
import TransferDetailsForm from '../src/features/transfers/components/TransferDetailsForm.vue'
import { seed, accounts } from './fixtures'
const meta = {
  title: 'Banking/TransferDetailsForm',
  component: TransferDetailsForm,
  args: { accounts, beneficiaries: seed.beneficiaries, demoDefaults: true },
  argTypes: {
    accounts: { control: 'object' },
    beneficiaries: { control: 'object' },
    initial: { control: 'object' },
  },
} satisfies Meta<typeof TransferDetailsForm>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const SavedRecipient: Story = {
  args: {
    initial: {
      sourceAccountId: accounts[0]!.id,
      recipientType: 'BENEFICIARY',
      savedBeneficiaryId: 'beneficiary-alex',
      destinationId: '',
      recipientNetwork: 'SAME_BANK',
      recipientAccountId: '',
      recipientName: '',
      bankName: '',
      amount: '10.50',
      reference: '',
    },
  },
}
export const NoSavedRecipients: Story = {
  args: {
    beneficiaries: [],
    initial: { ...SavedRecipient.args!.initial!, savedBeneficiaryId: '' },
  },
}
