import type { VNodeChild } from 'vue'
import type { Account } from '@/domain/accounts/account'
import type { Transaction } from '@/domain/transactions/transaction'

export interface TransactionItemScope {
  transaction: Transaction
  account: Account | undefined
  layout: 'table' | 'mobile'
}
export interface TransactionSlots {
  description?(props: TransactionItemScope): VNodeChild
  date?(props: TransactionItemScope): VNodeChild
  account?(props: TransactionItemScope): VNodeChild
  type?(props: TransactionItemScope): VNodeChild
  status?(props: TransactionItemScope): VNodeChild
  amount?(props: TransactionItemScope): VNodeChild
  'mobile-item'?(props: TransactionItemScope): VNodeChild
}
export const transactionSlotNames = [
  'description',
  'date',
  'account',
  'type',
  'status',
  'amount',
  'mobile-item',
] as const
