import { createFileRoute } from '@tanstack/react-router'
import { ConnectWithPage } from '@/pages/ConnectWithPage'

export const Route = createFileRoute('/_authenticated/connect-with/$externalId')({
  component: ConnectWithPage,
})
