/** The demo bank's own name; recipients at this bank map to internal accounts. */
export const HOME_BANK_NAME = 'Raksul-bank'

export function isHomeBank(bankName: string) {
  return bankName.trim().toLowerCase() === HOME_BANK_NAME.toLowerCase()
}

/** Account numbers are 8–20 digits. */
export const ACCOUNT_NUMBER_PATTERN = /^\d{8,20}$/

export function isAccountNumber(value: string) {
  return ACCOUNT_NUMBER_PATTERN.test(value)
}
