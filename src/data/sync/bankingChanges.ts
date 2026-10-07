export const BANKING_CHANGE_KEY = 'raksul-bank-change'
export const DEMO_RESET_KEY = 'raksul-bank-reset-generation'
export const RECOVERY_PREFIX = 'raksul-transfer-v1:'
export const BANKING_RESET_EVENT = 'raksul-bank-reset'
/** Publish only a change token after commit, never banking data. Reads do not publish. */
export function publishBankingChange(reset = false) {
  if (typeof window === 'undefined') return
  try {
    if (reset) {
      localStorage.setItem(DEMO_RESET_KEY, crypto.randomUUID())
      for (const key of Object.keys(localStorage))
        if (key.startsWith(`${RECOVERY_PREFIX}demo:`)) localStorage.removeItem(key)
    }
    localStorage.setItem(BANKING_CHANGE_KEY, JSON.stringify({ token: crypto.randomUUID(), reset }))
    if (reset) window.dispatchEvent(new Event(BANKING_RESET_EVENT))
  } catch {
    /* Persistence has committed; notification failure cannot turn it into a failed transfer. */
  }
}
