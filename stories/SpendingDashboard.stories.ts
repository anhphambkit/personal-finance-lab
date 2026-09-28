import type { Meta, StoryObj } from '@storybook/vue3-vite'
import SpendingDashboard from '../src/features/insights/components/SpendingDashboard.vue'
import type { SpendingInsight } from '../src/domain/spending/spendingInsight'

const insight: SpendingInsight = {
  month: '2026-08',
  totalMinor: '43200',
  previousTotalMinor: '48000',
  count: 12,
  breakdown: [
    { type: 'CARD', amountMinor: '32900', count: 9 },
    { type: 'CASH', amountMinor: '10000', count: 1 },
    { type: 'FEE', amountMinor: '300', count: 2 },
  ],
  trend: ['38200', '51000', '46000', '39800', '48000', '43200'].map((amountMinor, index) => ({
    month: `2026-${String(index + 3).padStart(2, '0')}`,
    amountMinor,
    count: 12,
  })),
}
const meta = {
  title: 'Banking/SpendingDashboard',
  component: SpendingDashboard,
  args: { insight },
  argTypes: { insight: { control: 'object' }, ui: { control: false } },
} satisfies Meta<typeof SpendingDashboard>
export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = {}
export const Empty: Story = {
  args: {
    insight: {
      ...insight,
      totalMinor: '0',
      count: 0,
      breakdown: insight.breakdown.map((item) => ({ ...item, amountMinor: '0', count: 0 })),
      trend: insight.trend.map((item) =>
        item.month === insight.month ? { ...item, amountMinor: '0', count: 0 } : item,
      ),
    },
  },
}
export const NoPriorSpending: Story = {
  args: {
    insight: {
      ...insight,
      previousTotalMinor: '0',
      trend: insight.trend.map((item) =>
        item.month === '2026-07' ? { ...item, amountMinor: '0', count: 0 } : item,
      ),
    },
  },
}
export const LargeAmounts: Story = {
  args: {
    insight: {
      ...insight,
      totalMinor: '27021597764222973',
      previousTotalMinor: '9007199254740991',
      breakdown: insight.breakdown.map((item) => ({ ...item, amountMinor: '9007199254740991' })),
      trend: insight.trend.map((item) => ({
        ...item,
        amountMinor: item.month === insight.month ? '27021597764222973' : '9007199254740991',
      })),
    },
  },
}
export const Customized: Story = {
  args: { ui: { summary: 'rounded-lg p-4 sm:p-4', trend: 'rounded-lg', breakdown: 'rounded-lg' } },
  render: (args) => ({
    components: { SpendingDashboard },
    setup: () => ({ args }),
    template: `<SpendingDashboard v-bind="args"><template #summary="{ insight: current }"><h2 class="font-semibold">Monthly activity snapshot</h2><p class="mt-2">{{ current.count }} completed payments in {{ current.month }}</p></template></SpendingDashboard>`,
  }),
}
