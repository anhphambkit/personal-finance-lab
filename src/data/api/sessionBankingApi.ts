import type { BankingApi } from '@/contracts/banking'
import type { BankingSession } from './bankingSession'
import { ApiError } from './apiError'

/** Guard all operations against identity changes, including recovery persistence before a transfer. */
export function createSessionBankingApi(
  api: BankingApi,
  session: BankingSession,
  beforeTransfer: () => Promise<void> | undefined,
  isReady: () => boolean,
): BankingApi {
  return {
    customer: (signal) => session.run(() => api.customer(signal)),
    accounts: (signal) => session.run(() => api.accounts(signal)),
    account: (id, signal) => session.run(() => api.account(id, signal)),
    transactions: (query, signal) => session.run(() => api.transactions(query, signal)),
    beneficiaries: (signal) => session.run(() => api.beneficiaries(signal)),
    lookupRecipient: (number, signal) => session.run(() => api.lookupRecipient(number, signal)),
    createBeneficiary: (request) => session.run(() => api.createBeneficiary(request)),
    executeTransfer: (request) =>
      session.run(async () => {
        const current = session.generation.value
        await beforeTransfer()
        if (current !== session.generation.value || !isReady())
          throw new ApiError(409, 'SESSION_CHANGED', 'The banking session changed.')
        return api.executeTransfer(request)
      }),
    transfer: (id, signal) => session.run(() => api.transfer(id, signal)),
    reset: (signal) => session.run(() => api.reset(signal)),
  }
}
