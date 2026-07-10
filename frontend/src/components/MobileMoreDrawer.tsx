import { Badge, Stack, Text, UnstyledButton, Group, Divider } from '@mantine/core'
import { IconBell, IconUsers, IconLogout, IconTableImport } from '@tabler/icons-react'
import { useMe } from '@/hooks/useMe'
import { useLogout } from '@/hooks/useLogout'
import { useNotificationUnreadCount } from '@/hooks/useNotificationUnreadCount'
import { UserAvatar } from '@/components/UserAvatar'
import { ResponsiveDrawer } from '@/components/ResponsiveDrawer'
import { InviteDrawer } from '@/components/InviteDrawer'
import { ImpersonationNotice } from '@/components/admin/ImpersonationNotice'
import { NotificationToggleRow } from '@/components/notifications/NotificationToggleRow'
import { openNotificationInboxDrawer } from '@/components/notifications/NotificationInboxDrawer'
import { router } from '@/router'
import { renderDrawer, useDrawerContext } from '@/utils/renderDrawer'
import { CommonTestIds, MobileNavTestIds, NotificationsTestIds } from '@/testIds'
import classes from './MobileMoreDrawer.module.css'

type MoreItem = {
  key: string
  label: string
  icon: typeof IconUsers
  onSelect: (close: () => void) => void
  danger?: boolean
}

export function MobileMoreDrawer() {
  const { opened, close } = useDrawerContext<void>()
  const { query: meQuery } = useMe()
  const user = meQuery.data
  const { mutation: logoutMutation } = useLogout()
  const { query: unreadQuery } = useNotificationUnreadCount((d) => d.count)
  const unreadCount = unreadQuery.data ?? 0

  const items: MoreItem[] = [
    {
      key: 'invite',
      label: 'Criar Conexão',
      icon: IconUsers,
      onSelect: (closeSheet) => {
        closeSheet()
        void renderDrawer(() => <InviteDrawer />).catch(() => {})
      },
    },
    {
      key: 'import',
      label: 'Importar transações',
      icon: IconTableImport,
      onSelect: (closeSheet) => {
        closeSheet()
        // renderDrawer mounts in an isolated React root without RouterProvider,
        // so useNavigate() returns null here. Drive navigation through the
        // global router instance instead.
        void router.navigate({ to: '/transactions/import' })
      },
    },
    {
      key: 'logout',
      label: 'Sair',
      icon: IconLogout,
      danger: true,
      onSelect: () => logoutMutation.mutate(),
    },
  ]

  function openNotificationsInbox() {
    close()
    openNotificationInboxDrawer()
  }

  return (
    <ResponsiveDrawer
      opened={opened}
      onClose={() => close()}
      styles={{ content: { height: 'auto', maxHeight: '85dvh' } }}
      title=""
      closeButtonProps={
        {
          'aria-label': 'Fechar',
          'data-testid': MobileNavTestIds.MoreClose,
          // Mantine types ModalBaseCloseButtonProps without data-* attrs, but
          // spreads any extras onto the underlying CloseButton element.
        } as React.ComponentProps<'button'>
      }
      closeOnClickOutside
      closeOnEscape
      data-testid={MobileNavTestIds.MoreDrawer}
      classNames={{ body: classes.body, header: classes.header }}
    >
      {user && (
        <>
          <Group gap="sm" px="md" pt="xs" pb="md" wrap="nowrap">
            <UserAvatar name={user.name} avatarUrl={user.avatar_url} size="md" />
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Text fw={600} size="sm" truncate>
                {user.name}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {user.email}
              </Text>
            </Stack>
          </Group>
          <Divider />
        </>
      )}
      <ImpersonationNotice />
      <Stack gap={0} py="xs">
        {items
          .filter((item) => !item.danger)
          .map((item) => {
            const Icon = item.icon
            return (
              <UnstyledButton
                key={item.key}
                onClick={() => item.onSelect(() => close())}
                className={classes.item}
                data-testid={MobileNavTestIds.MoreItem(item.key)}
              >
                <Icon size={20} />
                <Text size="sm" fw={500}>
                  {item.label}
                </Text>
              </UnstyledButton>
            )
          })}
        {/* Notificações inbox item — above NotificationToggleRow and "Sair" (INBOX-01, OD-4) */}
        <UnstyledButton
          onClick={openNotificationsInbox}
          className={classes.item}
          data-testid={NotificationsTestIds.MoreDrawerNotificationsItem}
        >
          <IconBell size={20} />
          <Text size="sm" fw={500} style={{ flex: 1 }}>
            Notificações
          </Text>
          {unreadCount > 0 && (
            <Badge
              size="xs"
              color="blue"
              data-testid={CommonTestIds.NavBadge('notifications')}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </UnstyledButton>
        {/* Notification toggle row — above "Sair" (CTRL-02, OD-2) */}
        <NotificationToggleRow variant="mobile" />
        {items
          .filter((item) => item.danger)
          .map((item) => {
            const Icon = item.icon
            return (
              <UnstyledButton
                key={item.key}
                onClick={() => item.onSelect(() => close())}
                className={classes.item}
                data-danger=""
                data-testid={MobileNavTestIds.MoreItem(item.key)}
              >
                <Icon size={20} />
                <Text size="sm" fw={500}>
                  {item.label}
                </Text>
              </UnstyledButton>
            )
          })}
      </Stack>
    </ResponsiveDrawer>
  )
}
