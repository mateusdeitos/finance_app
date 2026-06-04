import { createFileRoute } from '@tanstack/react-router'
import { NotificationInboxPage } from '@/pages/NotificationInboxPage'

export const Route = createFileRoute('/_authenticated/notifications')({
  component: NotificationInboxPage,
})
