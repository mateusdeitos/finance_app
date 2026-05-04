import { Stack, Text, UnstyledButton, Group, Divider } from '@mantine/core'
import { IconUsers, IconLogout, IconTableImport } from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'
import { useMe } from '@/hooks/useMe'
import { useLogout } from '@/hooks/useLogout'
import { UserAvatar } from '@/components/UserAvatar'
import { ResponsiveDrawer } from '@/components/ResponsiveDrawer'
import { InviteDrawer } from '@/components/InviteDrawer'
import { renderDrawer, useDrawerContext } from '@/utils/renderDrawer'
import { MobileNavTestIds } from '@/testIds'
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
  const navigate = useNavigate()

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
        void navigate({ to: '/transactions/import' })
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

  return (
    <ResponsiveDrawer
      opened={opened}
      onClose={() => close()}
      size="auto"
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
      <Stack gap={0} py="xs">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <UnstyledButton
              key={item.key}
              onClick={() => item.onSelect(() => close())}
              className={classes.item}
              data-danger={item.danger ? '' : undefined}
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
