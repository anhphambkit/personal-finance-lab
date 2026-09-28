import type { Meta, StoryObj } from '@storybook/vue3-vite'
import LoginForm from '../src/features/auth/components/LoginForm.vue'

const meta = {
  title: 'Banking/LoginForm',
  component: LoginForm,
  args: { busy: false, error: '' },
  argTypes: { ui: { control: false } },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof LoginForm>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Busy: Story = { args: { busy: true } }
export const Error: Story = { args: { error: 'Email or password is incorrect. Please try again.' } }
export const Customized: Story = {
  args: { ui: { root: 'rounded-lg shadow-none', demo: 'bg-primary/5' } },
  render: (args) => ({
    components: { LoginForm },
    setup: () => ({ args }),
    template: `<LoginForm v-bind="args"><template #intro>Explore balances, activity and transfers with sample data.</template></LoginForm>`,
  }),
}
