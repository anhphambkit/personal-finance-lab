import { z } from 'zod'
import type { TransactionQuery } from '../../contracts/transactions'

const positiveInteger = (maximum: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().max(maximum))

export const transactionQuerySchema = z
  .strictObject({
    accountId: z.string().trim().min(1).max(100).optional(),
    query: z.string().trim().max(200).optional(),
    direction: z.enum(['DEBIT', 'CREDIT']).optional(),
    type: z.enum(['TRANSFER', 'CARD', 'CASH', 'FEE', 'INTEREST']).optional(),
    status: z.enum(['PENDING', 'COMPLETED', 'FAILED']).optional(),
    dateFrom: z.iso.date().optional(),
    dateTo: z.iso.date().optional(),
    page: positiveInteger(1_000_000).default(1),
    pageSize: positiveInteger(100).default(20),
  })
  .refine((query) => !query.dateFrom || !query.dateTo || query.dateFrom <= query.dateTo, {
    message: 'Date range is reversed.',
  }) satisfies z.ZodType<TransactionQuery>
