import { describe, expect, it, vi } from 'vitest'
import { createServerRecoveryStorage } from '@/data/api/serverRecoveryStorage'

describe('authenticated server recovery storage', () => {
  it('isolates its owner key and serializes edits and deletion', async () => {
    const write = vi.fn<(value: string | null) => Promise<void>>().mockResolvedValue(undefined)
    const adapter = createServerRecoveryStorage({ key: 'owner-a', value: 'saved', write })
    expect(adapter.storage.getItem('owner-a')).toBe('saved')
    expect(adapter.storage.getItem('owner-b')).toBeNull()
    expect(() => adapter.storage.setItem('owner-b', 'wrong')).toThrow('another customer')
    adapter.storage.setItem('owner-a', 'first')
    adapter.storage.setItem('owner-a', 'second')
    adapter.storage.removeItem('owner-a')
    await adapter.flush()
    expect(write.mock.calls).toEqual([['first'], ['second'], [null]])
    expect(adapter.storage.getItem('owner-a')).toBeNull()
  })

  it('retains persistence failures and blocks subsequent edits and flushes', async () => {
    const write = vi.fn(async () => {
      throw new Error('Server unavailable')
    })
    const adapter = createServerRecoveryStorage({ key: 'owner', value: null, write })
    adapter.storage.setItem('owner', 'submitted-request')
    adapter.storage.setItem('owner', 'replacement')
    await expect(adapter.flush()).rejects.toThrow('Server unavailable')
    await expect(adapter.flush()).rejects.toThrow('Server unavailable')
    expect(() => adapter.storage.removeItem('owner')).toThrow('Server unavailable')
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('drops memory and queued writes on session disposal without deleting server data', async () => {
    const write = vi.fn<(value: string | null) => Promise<void>>().mockResolvedValue(undefined)
    const adapter = createServerRecoveryStorage({ key: 'owner', value: 'secret', write })
    adapter.storage.setItem('owner', 'queued')
    adapter.clear()
    expect(adapter.storage.getItem('owner')).toBeNull()
    expect(() => adapter.storage.setItem('owner', 'late')).toThrow('session has ended')
    await expect(adapter.flush()).rejects.toThrow('session has ended')
    expect(write).not.toHaveBeenCalled()
  })
})
