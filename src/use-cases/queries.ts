import type { BankingRepository } from './ports/BankingRepository'
import { selectCustomerAccounts } from './accounts/selectCustomerAccounts'
import { listTransactions } from './transactions/listTransactions'
import type { TransactionQuery } from '../contracts/transactions'

export class QueryError extends Error {
  readonly code = 'NOT_FOUND'
  constructor() {
    super('The requested account was not found.')
  }
}

export function createBankingQueries(repository: BankingRepository) {
  return {
    async customer() {
      return { ...(await repository.load()).customer }
    },
    async accounts() {
      return selectCustomerAccounts(await repository.load())
    },
    async account(id: string) {
      const account = selectCustomerAccounts(await repository.load()).find((item) => item.id === id)
      if (!account) throw new QueryError()
      return account
    },
    async transactions(query: TransactionQuery) {
      const state = await repository.load()
      const accounts = selectCustomerAccounts(state)
      if (query.accountId && !accounts.some((account) => account.id === query.accountId))
        throw new QueryError()
      return listTransactions(
        state.transactions,
        accounts.map((account) => account.id),
        query,
      )
    },
    async beneficiaries() {
      const state = await repository.load()
      return state.beneficiaries
        .filter((item) => item.customerId === state.customer.id)
        .map((item) => ({ ...item }))
    },
    async reset() {
      await repository.reset()
    },
  }
}
