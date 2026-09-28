import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDebouncedRecoverySave } from '../../features/transfers/debouncedRecoverySave'

afterEach(() => vi.useRealTimers())
describe('details recovery autosave', () => {
  it('coalesces rapid input and saves the latest details once', () => {
    vi.useFakeTimers()
    let details = '1'
    const save = vi.fn(() => details)
    const autosave = createDebouncedRecoverySave(save)
    autosave.schedule()
    vi.advanceTimersByTime(200)
    details = '10'
    autosave.schedule()
    vi.advanceTimersByTime(299)
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(save).toHaveReturnedWith('10')
    expect(save).toHaveBeenCalledTimes(1)
  })
  it('flushes on navigation and cancels stale details before review or identity changes', () => {
    vi.useFakeTimers()
    const save = vi.fn()
    const autosave = createDebouncedRecoverySave(save)
    autosave.schedule()
    autosave.flush()
    expect(save).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(300)
    expect(save).toHaveBeenCalledTimes(1)
    autosave.schedule()
    autosave.cancel()
    autosave.flush()
    vi.advanceTimersByTime(300)
    expect(save).toHaveBeenCalledTimes(1)
  })
})
