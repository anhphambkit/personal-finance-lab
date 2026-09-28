import type { Transaction } from '../../domain/transactions/transaction'
import type { PaginatedTransactions, TransactionQuery } from '../../contracts/transactions'

/** HTTP validates query values first. Scope before filtering, counting or pagination. */
export function listTransactions(
  transactions: readonly Transaction[],
  ownedAccountIds: readonly string[],
  query: TransactionQuery,
): PaginatedTransactions {
  const owned = new Set(ownedAccountIds)
  const search = query.query?.trim().toLowerCase() ?? ''
  const filtered = transactions
    .filter((entry) => {
      if (!owned.has(entry.accountId)) return false
      const date = new Date(entry.occurredAt).toISOString().slice(0, 10)
      return (
        (!query.accountId || entry.accountId === query.accountId) &&
        (!query.direction || entry.direction === query.direction) &&
        (!query.type || entry.type === query.type) &&
        (!query.status || entry.status === query.status) &&
        (!query.dateFrom || date >= query.dateFrom) &&
        (!query.dateTo || date <= query.dateTo) &&
        (!search ||
          [entry.description, entry.counterparty ?? '', entry.id].some((text) =>
            text.toLowerCase().includes(search),
          ))
      )
    })
    .sort(
      (left, right) =>
        Date.parse(right.occurredAt) - Date.parse(left.occurredAt) ||
        left.id.localeCompare(right.id),
    )
  const start = (query.page - 1) * query.pageSize
  return {
    data: filtered.slice(start, start + query.pageSize).map((entry) => ({ ...entry })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems: filtered.length,
      totalPages: Math.ceil(filtered.length / query.pageSize),
    },
  }
}
