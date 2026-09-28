import type { BankingState } from '../ports/BankingRepository'

/** Shared ownership boundary for customer account lists and direct-ID lookups. */
export function selectCustomerAccounts(state: BankingState) {
  return state.accounts
    .filter((account) => account.ownerId === state.customer.id)
    .map((account) => ({ ...account }))
}
