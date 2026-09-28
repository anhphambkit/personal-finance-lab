interface ServerRecoveryStorageOptions {
  key: string
  value: string | null
  write: (value: string | null) => Promise<void>
}

/** Synchronous form reads with ordered server persistence for one authenticated owner. */
export function createServerRecoveryStorage({
  key: ownerKey,
  value: initialValue,
  write,
}: ServerRecoveryStorageOptions) {
  let value = initialValue
  let active = true
  let failure: Error | undefined
  let pending = Promise.resolve()

  function persist(key: string, next: string | null) {
    if (!active) throw new Error('The recovery session has ended.')
    if (key !== ownerKey) throw new Error('Recovery storage belongs to another customer.')
    if (failure) throw failure
    value = next
    pending = pending.then(async () => {
      if (!active || failure) return
      try {
        await write(next)
      } catch (error) {
        // Keep the queue handled to avoid unhandled rejections, but fail every
        // flush and future edit until a fresh session reloads authoritative data.
        failure = error instanceof Error ? error : new Error('Recovery data could not be saved.')
      }
    })
  }

  const storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
    getItem: (key) => (active && key === ownerKey ? value : null),
    setItem: (key, next) => persist(key, next),
    removeItem: (key) => persist(key, null),
  }

  return {
    storage,
    async flush(): Promise<void> {
      // Include writes queued while a previous write is settling.
      let observed: Promise<void>
      do {
        observed = pending
        await observed
      } while (observed !== pending)
      if (failure) throw failure
      if (!active) throw new Error('The recovery session has ended.')
    },
    clear(): void {
      active = false
      value = null
    },
  }
}
