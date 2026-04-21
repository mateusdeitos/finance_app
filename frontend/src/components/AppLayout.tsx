import { AppShell, Badge, Burger, Group, Text, NavLink, Menu } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconReceipt2, IconChevronDown, IconUsers, IconWallet, IconTree, IconCreditCard } from "@tabler/icons-react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMe } from "@/hooks/useMe";
import { useLogout } from "@/hooks/useLogout";
import { useChargesPendingCount } from "@/hooks/useChargesPendingCount";
import { InviteDrawer } from "@/components/InviteDrawer";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { UserAvatar } from "@/components/UserAvatar";
import { renderDrawer } from "@/utils/renderDrawer";

const navLinks: Array<{ label: string; icon: typeof IconReceipt2; to: string }> = [
  { label: "Transações", icon: IconReceipt2, to: "/transactions" },
  { label: "Contas", icon: IconWallet, to: "/accounts" },
  { label: "Categorias", icon: IconTree, to: "/categories" },
  { label: "Cobrancas", icon: IconCreditCard, to: "/charges" },
];

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const { query: meQuery } = useMe();
  const user = meQuery.data;
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { mutation: logoutMutation } = useLogout();

  const { query: pendingCountQuery } = useChargesPendingCount();
  const pendingCount = pendingCountQuery.data?.count ?? 0;

  const chargeNavLinks = navLinks.map((link) =>
    link.to === "/charges" && pendingCount > 0
      ? { ...link, badge: pendingCount }
      : { ...link, badge: undefined },
  );

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 220, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
      style={{
        ["--app-shell-header-height" as string]: "calc(60px + env(safe-area-inset-top))",
        ["--app-shell-header-offset" as string]: "calc(60px + env(safe-area-inset-top))",
      }}
    >
      <AppShell.Header
        style={{ height: "calc(60px + env(safe-area-inset-top))", paddingTop: "env(safe-area-inset-top)" }}
      >
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
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
                <Group gap={4} wrap="nowrap" align="center" style={{ cursor: "pointer" }}>
                  <UserAvatar name={user?.name ?? "?"} avatarUrl={user?.avatar_url} size="sm" />
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
                  onClick={() => void renderDrawer(() => <InviteDrawer />).catch(() => {})}
                >
                  Criar Conexão
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
                  Sair
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {chargeNavLinks.map(({ label, icon: Icon, to, badge }) => (
          <NavLink
            key={to}
            component={Link}
            to={to}
            label={label}
            leftSection={<Icon size={18} />}
            rightSection={badge ? <Badge size="xs" circle color="red">{badge}</Badge> : undefined}
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

      <PWAInstallBanner />
    </AppShell>
  );
}
