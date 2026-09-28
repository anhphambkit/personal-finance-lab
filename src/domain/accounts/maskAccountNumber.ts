/** Only reveal the last four digits; short or malformed values stay completely masked. */
export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/[\s-]/g, '')
  if (!/^\d+$/.test(digits) || digits.length <= 4) return '••••'
  return `•••• ${digits.slice(-4)}`
}
