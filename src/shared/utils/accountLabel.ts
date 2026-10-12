import type { Account } from '@/domain/accounts/account'
import { maskAccountNumber } from '@/domain/accounts/maskAccountNumber'

/** Option label for account pickers: name, masked number and a frozen marker. */
export function accountLabel(account: Account) {
  const frozen = account.status === 'FROZEN' ? ' · Frozen' : ''
  return `${account.displayName} · ${maskAccountNumber(account.accountNumber)}${frozen}`
}
