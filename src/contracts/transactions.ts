import type { Transaction } from '../domain/transactions/transaction'
import type { Pagination } from './pagination'

export interface TransactionQuery {
  accountId?: string
  query?: string
  direction?: Transaction['direction']
  type?: Transaction['type']
  status?: Transaction['status']
  dateFrom?: string
  dateTo?: string
  page: number
  pageSize: number
}

export interface PaginatedTransactions {
  data: Transaction[]
  pagination: Pagination
}
