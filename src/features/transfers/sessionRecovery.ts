import type { Ref } from 'vue'
import type { BankingFetch } from '@/data/api/bankingApi'
import type { createAuthApi } from '@/data/api/authApi'
import type { BankingSession } from '@/data/api/bankingSession'
import { ApiError } from '@/data/api/apiError'
import { createServerRecoveryStorage } from '@/data/api/serverRecoveryStorage'
import { recoveryKey, setRecoveryStorage } from './transferRecovery'

/** One in-memory mirror, replaced only after verifying the current server owner. */
export function createSessionRecovery({
  fetcher,
  authApi,
  session,
  csrfToken,
  mocksEnabled = true,
}: {
  fetcher: BankingFetch
  authApi: ReturnType<typeof createAuthApi>
  session: BankingSession
  csrfToken: Ref<string>
  mocksEnabled?: boolean
}) {
  let recovery: ReturnType<typeof createServerRecoveryStorage> | undefined
  async function load(owner: string, signal?: AbortSignal) {
    const current = session.generation.value
    const check = () => {
      if (signal?.aborted || current !== session.generation.value)
        throw new ApiError(409, 'SESSION_CHANGED', 'The banking session changed.')
    }
    const authSession = await authApi.session()
    check()
    if (authSession.customer?.id !== owner)
      throw new ApiError(409, 'SESSION_CHANGED', 'Session changed. Sign in again.')
    const csrf = authSession.csrfToken
    const response = await fetcher('/api/recovery', {
      method: 'GET',
      headers: { 'X-Banking-User': owner },
    })
    if (!response.ok) throw new Error('Transfer recovery could not be loaded.')
    const data = await response.json()
    if (!data || !('value' in data) || (data.value !== null && typeof data.value !== 'string'))
      throw new Error('Transfer recovery could not be verified.')
    check()
    csrfToken.value = authSession.csrfToken
    recovery?.clear()
    recovery = createServerRecoveryStorage({
      key: recoveryKey(owner, mocksEnabled),
      value: data.value,
      write: async (value) => {
        const saved = await fetcher('/api/recovery', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrf,
            'X-Banking-User': owner,
          },
          body: JSON.stringify({ value }),
        })
        if (!saved.ok)
          throw new Error('Transfer recovery could not be saved. Reload before submitting.')
      },
    })
    setRecoveryStorage(recovery.storage)
  }
  async function clear() {
    try {
      await recovery?.flush()
    } catch {
      /* Clear identity even if storage is unavailable; submission requires successful flush. */
    }
    recovery?.clear()
    recovery = undefined
  }
  return {
    load,
    clear,
    flush: () => recovery?.flush(),
    reset: (owner: string) => recovery?.storage.removeItem(recoveryKey(owner, mocksEnabled)),
  }
}
