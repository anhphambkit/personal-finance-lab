import { ACCOUNT_NUMBER_PATTERN } from '../../domain/accounts/accountIdentity'
import { z } from 'zod'

export const beneficiaryRequestSchema = z.strictObject({
  displayName: z.string().trim().min(1, 'Enter a recipient name.').max(80),
  bankName: z.string().trim().min(1, 'Enter a bank name.').max(80),
  accountNumber: z.string().trim().regex(ACCOUNT_NUMBER_PATTERN, 'Enter 8–20 digits.'),
  currency: z.literal('USD'),
})
