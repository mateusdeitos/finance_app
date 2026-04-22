import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'
import { TransactionsPage } from '@/pages/TransactionsPage'

const now = new Date()

const transactionSearchSchema = z.object({
  month: z.coerce.number().int().min(1).max(12).default(now.getMonth() + 1),
  year: z.coerce.number().int().default(now.getFullYear()),
  query: z.string().default(''),
  tagIds: z.array(z.number()).default([]),
  categoryIds: z.array(z.number()).default([]),
  accountIds: z.array(z.number()).default([]),
  types: z.array(z.enum(['expense', 'income', 'transfer'])).default([]),
  groupBy: z.enum(['date', 'category', 'account']).default('date'),
  accumulated: z.coerce.boolean().default(false),
  hideSettlements: z.coerce.boolean().default(false),
})

export const Route = createFileRoute('/_authenticated/transactions')({
  validateSearch: zodValidator(transactionSearchSchema),
  component: TransactionsPage,
})
