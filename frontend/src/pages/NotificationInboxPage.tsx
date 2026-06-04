import { Stack, Title } from '@mantine/core'
import { NotificationInboxContent } from '@/components/notifications/NotificationInboxContent'

/**
 * Desktop full-page inbox at /notifications.
 *
 * Renders inside the standard AppShell.Main page container.
 * Heading: fw=700 at size="lg" (18px, consistent with other page headings).
 * Content: the shared NotificationInboxContent (no onRowTap — page stays open).
 * No Paper wrapper — bare page background per UI-SPEC Surface 2 desktop.
 */
export function NotificationInboxPage() {
  return (
    <Stack gap="md" p="md">
      <Title order={2} fw={700} size="lg">
        Notificações
      </Title>
      <NotificationInboxContent />
    </Stack>
  )
}
