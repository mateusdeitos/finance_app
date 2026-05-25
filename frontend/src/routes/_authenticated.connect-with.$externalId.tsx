import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'
import { ConnectWithPage } from '@/pages/ConnectWithPage'

const connectWithSearchSchema = z.object({
  split: z.coerce.number().int().min(1).max(99).optional(),
})

export const Route = createFileRoute('/_authenticated/connect-with/$externalId')({
  validateSearch: zodValidator(connectWithSearchSchema),
  component: ConnectWithPage,
})
