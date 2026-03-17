import { AppShell, Burger, Group, Text, NavLink, Avatar, Menu, ActionIcon, Box } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconReceipt2, IconChevronDown } from '@tabler/icons-react'
import { Link, useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useMe } from '@/hooks/useMe'
import { useLogout } from '@/hooks/useLogout'

const navLinks = [
  { label: 'Transações', icon: IconReceipt2, to: '/transactions' },
]

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const [opened, { toggle }] = useDisclosure()
  const { query: meQuery } = useMe()
  const user = meQuery.data
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const { mutation: logoutMutation } = useLogout()

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Group gap="xs">
              <Box
                w={36}
                h={36}
                style={(theme) => ({
                  background: theme.colors.blue[7],
                  borderRadius: theme.radius.sm,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: 14,
                })}
              >
                F
              </Box>
              <Text fw={700} size="lg" c="blue.7">
                FinanceApp
              </Text>
            </Group>
          </Group>

          {user && (
            <Menu shadow="md" width={180} position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="subtle" size="xl" radius="xl" aria-label="User menu">
                  <Group gap="xs" wrap="nowrap">
                    <Avatar color="blue" radius="xl" size="sm">
                      {initials}
                    </Avatar>
                    <Text size="sm" fw={500} visibleFrom="sm">
                      {user.name}
                    </Text>
                    <IconChevronDown size={14} />
                  </Group>
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{user.email}</Menu.Label>
                <Menu.Item
                  onClick={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                >
                  Sair
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {navLinks.map(({ label, icon: Icon, to }) => (
          <NavLink
            key={to}
            component={Link}
            to={to}
            label={label}
            leftSection={<Icon size={18} />}
            active={currentPath === to}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        {children}
      </AppShell.Main>
    </AppShell>
  )
}
