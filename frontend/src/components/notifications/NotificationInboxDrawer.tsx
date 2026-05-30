import { Title } from '@mantine/core'
import { ResponsiveDrawer } from '@/components/ResponsiveDrawer'
import { useDrawerContext } from '@/utils/renderDrawer'
import { NotificationsTestIds } from '@/testIds'
import { NotificationInboxContent } from './NotificationInboxContent'

/**
 * Mobile bottom-sheet inbox drawer.
 *
 * Opened via renderDrawer: `void renderDrawer(() => <NotificationInboxDrawer />)`
 *
 * Uses useDrawerContext<void> to access the opened/close/reject from the
 * renderDrawer portal. Row taps pass `close` as onRowTap so the sheet closes
 * after mark-read + navigate (INBOX-03).
 *
 * Navigation inside the drawer uses the global `router` from @/router
 * (rendered inside renderDrawer root which includes RouterContextProvider,
 * but NotificationRow also imports router directly for safety in case of
 * future refactors).
 */
export function NotificationInboxDrawer() {
  const { opened, close, reject } = useDrawerContext<void>()

  return (
    <ResponsiveDrawer
      opened={opened}
      onClose={reject}
      position="bottom"
      styles={{ content: { height: 'auto', maxHeight: '92dvh' } }}
      title={
        <Title order={3} size="lg" fw={700}>
          Notificações
        </Title>
      }
      closeButtonProps={
        {
          'aria-label': 'Fechar',
          'data-testid': NotificationsTestIds.DrawerClose,
        } as React.ComponentProps<'button'>
      }
      closeOnClickOutside
      closeOnEscape
      data-testid={NotificationsTestIds.Drawer}
    >
      <NotificationInboxContent onRowTap={() => close(undefined as void)} />
    </ResponsiveDrawer>
  )
}

/**
 * Opens the notification inbox bottom-sheet drawer.
 * Call from any context (including renderDrawer roots lacking RouterProvider).
 *
 * Usage:
 *   import { openNotificationInboxDrawer } from '@/components/notifications/NotificationInboxDrawer'
 *   openNotificationInboxDrawer()
 */
export function openNotificationInboxDrawer(): void {
  // Import renderDrawer lazily to avoid circular dep issues at module load time.
  // The dynamic import is intentional and safe — renderDrawer is always available.
  import('@/utils/renderDrawer').then(({ renderDrawer }) => {
    void renderDrawer(() => <NotificationInboxDrawer />).catch(() => {})
  }).catch(() => {})
}
