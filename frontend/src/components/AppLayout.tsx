import {
  AppShell,
  Burger,
  Group,
  Text,
  NavLink,
  Avatar,
  Menu,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconReceipt2,
  IconChevronDown,
  IconUsers,
  IconWallet,
  IconTree,
} from "@tabler/icons-react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMe } from "@/hooks/useMe";
import { useLogout } from "@/hooks/useLogout";
import { InviteDrawer } from "@/components/InviteDrawer";

const navLinks = [
  { label: "Transações", icon: IconReceipt2, to: "/transactions" },
  { label: "Contas", icon: IconWallet, to: "/accounts" },
  { label: "Categorias", icon: IconTree, to: "/categories" },
];

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const [inviteOpened, { open: openInvite, close: closeInvite }] =
    useDisclosure();
  const { query: meQuery } = useMe();
  const user = meQuery.data;
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { mutation: logoutMutation } = useLogout();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 220, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
            />
            <Link to="/transactions" style={{ textDecoration: "none" }}>
              <Group gap="xs">
                <img src="/icon.svg" width={36} height={36} alt="FinanceApp" />
                <Text fw={700} size="lg" c="blue.7">
                  FinanceApp
                </Text>
              </Group>
            </Link>
          </Group>

          {user && (
            <Menu shadow="md" position="bottom-end">
              <Menu.Target>
                <Group
                  gap={4}
                  wrap="nowrap"
                  align="center"
                  style={{ cursor: "pointer" }}
                >
                  <Avatar color="blue" radius="xl" size="sm">
                    {initials}
                  </Avatar>
                  <Text size="sm" fw={500} visibleFrom="sm">
                    {user.name.split(" ")[0]}
                  </Text>
                  <IconChevronDown size={14} />
                </Group>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{user.email}</Menu.Label>
                <Menu.Item
                  leftSection={<IconUsers size={16} />}
                  onClick={openInvite}
                >
                  Criar Conexão
                </Menu.Item>
                <Menu.Divider />
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
            onClick={close}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main
        className="scroll-container"
        style={{
          height: "100dvh",
          overflow: "hidden auto",
          boxSizing: "border-box",
        }}
      >
        <Outlet />
      </AppShell.Main>

      <InviteDrawer opened={inviteOpened} onClose={closeInvite} />
    </AppShell>
  );
}
