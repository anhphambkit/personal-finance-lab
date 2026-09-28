import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { QueryClient, useQuery, VueQueryPlugin } from '@tanstack/vue-query'
import { createBankingSession } from '@/data/api/bankingSession'
import { bankingQueryKeys } from '@/data/api/bankingQueryKeys'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const customer = (id: string) => ({ id, firstName: id, lastName: 'Test', displayName: id })

function fixture(cleanupRecovery?: (id: string) => void) {
  const ready = ref(true)
  let identity = 'A'
  const resolveCustomer = vi.fn(async () => customer(identity))
  const session = createBankingSession({
    userId: ref<string | null>('A'),
    ready,
    resolveCustomer,
    cleanupRecovery,
  })
  return {
    ready,
    session,
    resolveCustomer,
    setIdentity: (id: string) => {
      identity = id
    },
  }
}

describe('banking session isolation', () => {
  it('never renders A after B becomes active, even with shared account IDs and a late A response', async () => {
    const { ready, session, setIdentity } = fixture()
    const lateA = deferred<string>()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const oldKey = bankingQueryKeys.accounts(session.scope.value)
    client.setQueryData(oldKey, 'A balance')
    session.onClear(async () => {
      await client.cancelQueries()
      client.clear()
    })
    const Content = defineComponent({
      setup() {
        const query = useQuery({
          queryKey: computed(() => bankingQueryKeys.accounts(session.scope.value)),
          enabled: ready,
          queryFn: () =>
            session.run(() =>
              session.userId.value === 'A' ? lateA.promise : Promise.resolve('B balance'),
            ),
        })
        return () => h('p', query.data.value)
      },
    })
    const wrapper = mount(
      {
        setup: () => () =>
          ready.value ? h(Content, { key: session.generation.value }) : h('p', 'Session changing'),
      },
      {
        global: { plugins: [[VueQueryPlugin, { queryClient: client }]] },
      },
    )
    expect(wrapper.text()).toBe('A balance')
    const observed: string[] = []
    const observer = new MutationObserver(() => observed.push(wrapper.text()))
    observer.observe(wrapper.element.parentNode ?? wrapper.element, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    await session.changeIdentity(async () => {
      setIdentity('B')
    })
    await vi.waitFor(() => expect(wrapper.text()).toBe('B balance'))
    lateA.resolve('A late private balance')
    await nextTick()
    await Promise.resolve()
    expect(wrapper.text()).toBe('B balance')
    expect(client.getQueryData(oldKey)).toBeUndefined()
    expect(observed.every((text) => !text.includes('A late'))).toBe(true)
    observer.disconnect()
    wrapper.unmount()
    client.clear()
  })

  it('rejects a mutation result from a previous session without replaying it', async () => {
    const { session, setIdentity } = fixture()
    const receipt = deferred<string>()
    const request = vi.fn(() => receipt.promise)
    const result = session.run(request)
    const assertion = expect(result).rejects.toMatchObject({ code: 'SESSION_CHANGED' })
    await session.changeIdentity(async () => {
      setIdentity('B')
    })
    receipt.resolve('A receipt')
    await assertion
    expect(request).toHaveBeenCalledOnce()
  })

  it('clears credentials on logout even if local recovery storage is corrupt', async () => {
    const { session, ready } = fixture(() => {
      throw new Error('Corrupt storage')
    })
    const logout = vi.fn(async () => {})
    await session.logout(logout)
    expect(logout).toHaveBeenCalledOnce()
    expect(session.userId.value).toBeNull()
    expect(ready.value).toBe(false)
    expect(session.status.value).toBe('signed-out')
    expect(session.cleanupError.value).not.toBe('')
  })

  it('serializes overlapping credential writes so an older login cannot overwrite the newest identity', async () => {
    const { session, setIdentity } = fixture()
    const firstGate = deferred<void>()
    const first = vi.fn(async () => {
      await firstGate.promise
      setIdentity('A')
    })
    const second = vi.fn(async () => {
      setIdentity('B')
    })
    const a = session.changeIdentity(first)
    await vi.waitFor(() => expect(first).toHaveBeenCalledOnce())
    const b = session.changeIdentity(second)
    await nextTick()
    expect(second).not.toHaveBeenCalled()
    firstGate.resolve()
    await Promise.all([a, b])
    expect(session.userId.value).toBe('B')
    expect(second).toHaveBeenCalledOnce()
  })

  it('rejects a late identity response and keeps reads disabled when identity lookup fails', async () => {
    const ready = ref(true)
    const old = deferred<ReturnType<typeof customer>>()
    const resolveCustomer = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockRejectedValueOnce(new Error('Offline'))
    const session = createBankingSession({ userId: ref('A'), ready, resolveCustomer })
    const a = session.changeIdentity()
    await vi.waitFor(() => expect(resolveCustomer).toHaveBeenCalledOnce())
    await session.changeIdentity()
    old.resolve(customer('A'))
    await a
    expect(session.userId.value).toBeNull()
    expect(ready.value).toBe(false)
    await expect(session.run(async () => 'private')).rejects.toMatchObject({
      code: 'SESSION_REQUIRED',
    })
  })
})
