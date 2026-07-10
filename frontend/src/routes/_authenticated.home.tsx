import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'
import { HomePage } from '@/pages/HomePage'

const now = new Date()

export const homeSearchSchema = z.object({
  month: z.coerce.number().int().min(1).max(12).default(now.getMonth() + 1),
  year: z.coerce.number().int().default(now.getFullYear()),
  // Accumulate the account balances across all prior periods (same flag as the
  // transactions list).
  accumulated: z.coerce.boolean().default(false),
  // Drop settlements from the expense-by-category chart ("considerar acertos").
  hideSettlements: z.coerce.boolean().default(false),
})

export type HomeSearch = z.infer<typeof homeSearchSchema>

export const Route = createFileRoute('/_authenticated/home')({
  validateSearch: zodValidator(homeSearchSchema),
  component: HomePage,
})
