import type { Transaction } from '@/domain/transactions/transaction'

export const transactionDirectionLabels: Record<Transaction['direction'], string> = {
  DEBIT: 'Money out',
  CREDIT: 'Money in',
}

export const transactionTypeLabels: Record<Transaction['type'], string> = {
  TRANSFER: 'Transfer',
  CARD: 'Card',
  CASH: 'Cash',
  FEE: 'Fee',
  INTEREST: 'Interest',
}

export const transactionStatusLabels: Record<Transaction['status'], string> = {
  COMPLETED: 'Completed',
  PENDING: 'Pending',
  FAILED: 'Failed',
}
