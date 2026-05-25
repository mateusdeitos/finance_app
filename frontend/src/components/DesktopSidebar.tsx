import { Badge, Group, Menu, Text } from "@mantine/core";
import {
  IconCreditCard,
  IconReceipt2,
  IconTree,
  IconWallet,
  IconUserPlus,
  IconLogout,
  IconChevronDown,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useMe } from "@/hooks/useMe";
import { useLogout } from "@/hooks/useLogout";
import { useAccounts } from "@/hooks/useAccounts";
import { useChargesPendingCount } from "@/hooks/useChargesPendingCount";
import { UserAvatar } from "@/components/UserAvatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { InviteDrawer } from "@/components/InviteDrawer";
import { renderDrawer } from "@/utils/renderDrawer";
import { CommonTestIds } from "@/testIds";
import { Transactions } from "@/types/transactions";
import classes from "./DesktopSidebar.module.css";

type NavLinkDef = {
  to: string;
  label: string;
  icon: TablerIcon;
};

const navLinks: NavLinkDef[] = [
  { to: "/transactions", label: "Transações", icon: IconReceipt2 },
  { to: "/accounts", label: "Contas", icon: IconWallet },
  { to: "/categories", label: "Categorias", icon: IconTree },
  { to: "/charges", label: "Cobranças", icon: IconCreditCard },
];

type Connection = {
  id: number;
  name: string;
  avatarUrl?: string;
};

function selectAcceptedConnections(meId: number | undefined) {
  return (accounts: Transactions.Account[]): Connection[] => {
    if (!meId) return [];
    const seen = new Set<number>();
    const out: Connection[] = [];
    for (const acc of accounts) {
      const c = acc.user_connection;
      if (!c || c.connection_status !== "accepted" || seen.has(c.id)) continue;
      seen.add(c.id);
      const isFrom = c.from_user_id === meId;
      out.push({
        id: c.id,
        name: (isFrom ? c.to_user_name : c.from_user_name) ?? "?",
        avatarUrl: isFrom ? c.to_user_avatar_url : c.from_user_avatar_url,
      });
    }
    return out;
  };
}

export function DesktopSidebar() {
  const { query: meQuery } = useMe();
  const user = meQuery.data;
  const { mutation: logoutMutation } = useLogout();
  const { query: connectionsQuery } = useAccounts<Connection[]>(selectAcceptedConnections(user?.id));
  const connections = connectionsQuery.data ?? [];
  const { query: pendingQuery } = useChargesPendingCount();
  const pendingCount = pendingQuery.data?.count ?? 0;

  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const openInvite = () => {
    void renderDrawer(() => <InviteDrawer />).catch(() => {});
  };

  return (
    <nav className={classes.sidebar} aria-label="Navegação lateral">
      <Link to="/transactions" className={classes.brand} data-testid={CommonTestIds.SidebarBrand}>
        <img src="/icon.svg" width={28} height={28} alt="FinanceApp" />
        <span className={classes.brandText}>FinanceApp</span>
      </Link>

      <div className={classes.navGroup}>
        {navLinks.map(({ to, label, icon: Icon }) => {
          const active = currentPath === to || currentPath.startsWith(`${to}/`);
          const showBadge = to === "/charges" && pendingCount > 0;
          return (
            <Link key={to} to={to} className={classes.navItem} data-active={active ? "" : undefined}>
              <span className={classes.navIcon}>
                <Icon size={18} />
              </span>
              <span className={classes.navLabel}>{label}</span>
              {showBadge && (
                <Badge size="xs" circle color="red" data-testid={CommonTestIds.NavBadge(to.slice(1))}>
                  {pendingCount}
                </Badge>
              )}
            </Link>
          );
        })}
      </div>

      <div className={classes.sectionLabel}>Conexões</div>
      <div className={classes.navGroup}>
        {connections.map((c) => (
          <div key={c.id} className={classes.connectionItem} data-testid={CommonTestIds.NavConnection(c.id)}>
            <UserAvatar name={c.name} avatarUrl={c.avatarUrl} size="sm" />
            <span className={classes.connectionName}>{c.name}</span>
          </div>
        ))}
        <button
          type="button"
          className={classes.navItem}
          onClick={openInvite}
          data-testid={CommonTestIds.NavCreateConnection}
        >
          <span className={classes.navIcon}>
            <IconUserPlus size={18} />
          </span>
          <span className={classes.navLabel}>Criar conexão</span>
        </button>
      </div>

      <div className={classes.spacer} />

      {user && (
        <Menu shadow="md" position="top-start" width="target">
          <Menu.Target>
            <button type="button" className={classes.userPill} data-testid={CommonTestIds.SidebarUserPill}>
              <UserAvatar name={user.name} avatarUrl={user.avatar_url} size="md" />
              <div className={classes.userPillInfo}>
                <span className={classes.userPillName}>{user.name.split(" ")[0]}</span>
                <span className={classes.userPillEmail}>{user.email}</span>
              </div>
              <IconChevronDown size={14} />
            </button>
          </Menu.Target>
          <Menu.Dropdown data-testid={CommonTestIds.SidebarUserMenu}>
            <Menu.Label>{user.email}</Menu.Label>
            <div className={classes.themeMenuItem}>
              <Group gap="xs" wrap="nowrap" align="center">
                <Text size="sm">Tema</Text>
                <ThemeToggle />
              </Group>
            </div>
            <Menu.Divider />
            <Menu.Item
              leftSection={<IconLogout size={16} />}
              color="red"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              Sair
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
    </nav>
  );
}
