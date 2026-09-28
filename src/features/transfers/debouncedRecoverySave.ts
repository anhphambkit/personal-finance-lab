/** Only details autosaves may be deferred. Review and pre-submit recovery writes
 * must remain synchronous; cancel pending autosaves before those transitions.
 */
export function createDebouncedRecoverySave(save: () => void, delay = 300) {
  let timer: ReturnType<typeof setTimeout> | undefined
  function cancel() {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  function flush() {
    if (timer === undefined) return
    cancel()
    save()
  }
  return {
    schedule() {
      cancel()
      timer = setTimeout(flush, delay)
    },
    flush,
    cancel,
  }
}
