import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useTransferFlow } from '@/features/transfers/composables/useTransferFlow'
import { prepareTransfer } from '@/features/transfers/transferDraft'
import { createSeedState } from '@/data/seed/createSeedState'
import { readRecovery, recoveryKey } from '@/features/transfers/transferRecovery'

const mock = vi.hoisted(() => ({ mutateAsync: vi.fn(), reset: vi.fn() }))
vi.mock('@/features/transfers/composables/useTransfer', () => ({ useTransfer: () => mock }))
const ready = ref(true)
const userId = ref<string | null>('user-a')
const generation = ref(0)
vi.mock('@/data/api/bankingContext', () => ({
  useBankingContext: () => ({ ready, mocksEnabled: false, session: { userId, generation } }),
}))
const details = {
  sourceAccountId: 'account-checking',
  recipientType: 'OWN_ACCOUNT' as const,
  destinationId: 'account-savings',
  recipientNetwork: 'SAME_BANK' as const,
  recipientAccountId: '',
  recipientName: '',
  bankName: '',
  amount: '10.50',
  reference: 'Flow test',
}
const seed = createSeedState()
const draft = () => prepareTransfer(details, seed.accounts, seed.beneficiaries)
function setup() {
  userId.value = 'user-a'
  ready.value = true
  generation.value = 0
  let flow!: ReturnType<typeof useTransferFlow>
  const wrapper = mount(
    defineComponent({
      setup() {
        flow = useTransferFlow(() => {})
        return () => h('div')
      },
    }),
  )
  return { flow, wrapper }
}
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
describe('transfer flow transitions', () => {
  it('cancels a pending autosave before review and preserves uncertain same-key retry', async () => {
    vi.useFakeTimers()
    const { flow, wrapper } = setup()
    flow.changed(details)
    const payment = draft()
    flow.review(payment)
    await vi.advanceTimersByTimeAsync(350)
    expect(readRecovery(recoveryKey('user-a', false))?.stage).toBe('REVIEW')
    mock.mutateAsync.mockRejectedValue(new Error('lost response'))
    await flow.confirm()
    expect(flow.state.value.kind).toBe('uncertain')
    expect(flow.canLeave()).toBe(false)
    flow.back()
    expect(flow.state.value.kind).toBe('uncertain')
    await flow.confirm()
    expect(mock.mutateAsync).toHaveBeenNthCalledWith(1, payment.request)
    expect(mock.mutateAsync).toHaveBeenNthCalledWith(2, payment.request)
    wrapper.unmount()
  })
  it('ignores an old completion and cancels autosave when the session changes', async () => {
    vi.useFakeTimers()
    const { flow, wrapper } = setup()
    let finish!: (receipt: unknown) => void
    mock.mutateAsync.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    flow.review(draft())
    const confirmation = flow.confirm()
    expect(flow.state.value.kind).toBe('submitting')
    ready.value = false
    generation.value++
    userId.value = 'user-b'
    expect(flow.state.value.kind).toBe('details')
    expect(flow.canLeave()).toBe(true)
    ready.value = true
    await nextTick()
    finish({ id: 'old-receipt' })
    await confirmation
    expect(flow.receipt.value).toBeUndefined()
    flow.changed(details)
    ready.value = false
    generation.value++
    userId.value = null
    await vi.advanceTimersByTimeAsync(350)
    expect(readRecovery(recoveryKey('user-b', false))).toBeUndefined()
    wrapper.unmount()
  })
  it('does not submit a confirmation queued behind a lock after logout', async () => {
    let unlock!: () => Promise<void>
    vi.stubGlobal('navigator', {
      locks: {
        request: vi.fn(
          (_name, _options, callback) =>
            new Promise<void>((resolve) => {
              unlock = async () => {
                await callback()
                resolve()
              }
            }),
        ),
      },
    })
    const { flow, wrapper } = setup()
    flow.review(draft())
    const confirmation = flow.confirm()
    expect(flow.pending.value).toBe(true)
    ready.value = false
    generation.value++
    userId.value = null
    await unlock()
    await confirmation
    expect(mock.mutateAsync).not.toHaveBeenCalled()
    expect(flow.canLeave()).toBe(true)
    wrapper.unmount()
  })
})
