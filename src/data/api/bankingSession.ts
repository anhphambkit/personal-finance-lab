import { computed, nextTick, readonly, ref, type Ref } from 'vue'
import type { Customer } from '@/domain/customers/customer'
import { ApiError } from './apiError'

/** Cache identity is obtained from the authenticated API, never an account picker. */
export function createBankingSession(options: {
  userId?: Ref<string | null>
  generation?: Ref<number>
  ready: Ref<boolean>
  resolveCustomer: (signal: AbortSignal) => Promise<Customer>
  cleanupRecovery?: (userId: string) => void
}) {
  const userId = options.userId ?? ref<string | null>(null)
  const generation = options.generation ?? ref(0)
  const error = ref<unknown>()
  const cleanupError = ref('')
  const status = ref<'loading' | 'authenticated' | 'signed-out' | 'error'>(
    userId.value ? 'authenticated' : 'loading',
  )
  let credentialChanges: Promise<void> = Promise.resolve()
  const cleanups = new Set<() => Promise<void> | void>()
  let controller: AbortController | undefined

  async function transition(changeCredentials?: () => Promise<void>, resolve = true) {
    const previousUser = userId.value
    options.ready.value = false
    userId.value = null
    const current = ++generation.value
    error.value = undefined
    cleanupError.value = ''
    status.value = 'loading'
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    try {
      // Unmount sensitive page state before credentials can change.
      await nextTick()
      await Promise.all([...cleanups].map((cleanup) => cleanup()))
      if (previousUser) {
        try {
          options.cleanupRecovery?.(previousUser)
        } catch {
          cleanupError.value = 'Saved transfer data could not be cleared from this browser.'
        }
      }
      if (current !== generation.value) return
      // Serialize credential writes: an older callback must finish before a newer one starts.
      const changed = credentialChanges.then(async () => {
        if (current === generation.value) await changeCredentials?.()
      })
      credentialChanges = changed.catch(() => {})
      await changed
      if (current !== generation.value) return
      if (!resolve) {
        status.value = 'signed-out'
        return
      }
      const customer = await options.resolveCustomer(signal)
      if (current !== generation.value) return
      userId.value = customer.id
      options.ready.value = true
      status.value = 'authenticated'
    } catch (cause) {
      if (current === generation.value) {
        error.value = cause instanceof ApiError && cause.status === 401 ? undefined : cause
        status.value = cause instanceof ApiError && cause.status === 401 ? 'signed-out' : 'error'
      }
    }
  }

  return {
    userId: readonly(userId),
    generation: readonly(generation),
    error: readonly(error),
    cleanupError: readonly(cleanupError),
    status: readonly(status),
    scope: computed(() => [userId.value, generation.value] as const),
    onClear(cleanup: () => Promise<void> | void) {
      cleanups.add(cleanup)
      return () => cleanups.delete(cleanup)
    },
    /** Call BEFORE login/account-switch changes credentials. */
    changeIdentity: (changeCredentials?: () => Promise<void>) => transition(changeCredentials),
    /** The supplied callback must invalidate the server session/cookie. */
    logout: (clearCredentials: () => Promise<void>) => transition(clearCredentials, false),
    async run<T>(operation: () => Promise<T>): Promise<T> {
      if (!options.ready.value || !userId.value)
        throw new ApiError(401, 'SESSION_REQUIRED', 'A banking session is required.')
      const current = generation.value
      try {
        const result = await operation()
        if (current !== generation.value) throw new Error('Session changed')
        return result
      } catch (cause) {
        if (current !== generation.value)
          throw new ApiError(
            409,
            'SESSION_CHANGED',
            'The banking session changed. Reload your data.',
          )
        if (
          cause instanceof ApiError &&
          (cause.status === 401 || cause.code === 'SESSION_CHANGED')
        ) {
          await transition(undefined, false)
        }
        throw cause
      }
    },
  }
}
export type BankingSession = ReturnType<typeof createBankingSession>
