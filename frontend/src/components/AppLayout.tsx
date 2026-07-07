import { AppShell, Group, Menu, Text, Box } from "@mantine/core";
import { IconLogout, IconUsers, IconEyeglass } from "@tabler/icons-react";
import { Link, Outlet } from "@tanstack/react-router";
import { useMe } from "@/hooks/useMe";
import { useLogout } from "@/hooks/useLogout";
import { useIsMobile } from "@/hooks/useIsMobile";
import { InviteDrawer } from "@/components/InviteDrawer";
import { MobileTabBar } from "@/components/MobileTabBar";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { UserAvatar } from "@/components/UserAvatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { useServiceWorkerNavigation } from "@/hooks/useServiceWorkerNavigation";
import { renderDrawer } from "@/utils/renderDrawer";
import { ImpersonateUserDrawer } from "@/components/admin/ImpersonateUserDrawer";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { AdminTestIds } from "@/testIds";

const MOBILE_HEADER_HEIGHT = 50;
const MOBILE_TAB_BAR_HEIGHT = 56;

export function AppLayout() {
  const { query: meQuery } = useMe();
  const user = meQuery.data;
  const { mutation: logoutMutation } = useLogout();
  const isMobile = useIsMobile();

  // Mount the SW navigation listener once high in the authenticated tree (Plan 03 contract).
  useServiceWorkerNavigation();

  return (
    <AppShell
      header={{ height: MOBILE_HEADER_HEIGHT, collapsed: !isMobile }}
      navbar={{ width: 220, breakpoint: "sm", collapsed: { mobile: true, desktop: false } }}
      padding="md"
      style={
        isMobile
          ? {
              ["--app-shell-header-height" as string]: `calc(${MOBILE_HEADER_HEIGHT}px + env(safe-area-inset-top))`,
              ["--app-shell-header-offset" as string]: `calc(${MOBILE_HEADER_HEIGHT}px + env(safe-area-inset-top))`,
            }
          : undefined
      }
    >
      <AppShell.Header
        hiddenFrom="sm"
        style={{
          height: `calc(${MOBILE_HEADER_HEIGHT}px + env(safe-area-inset-top))`,
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Link to="/home" style={{ textDecoration: "none" }}>
            <Group gap="xs" wrap="nowrap">
              <img src="/icon.svg" width={24} height={24} alt="FinanceApp" />
              <Text fw={700} size="sm" c="blue.7">
                FinanceApp
              </Text>
            </Group>
          </Link>

          <Group gap="xs" wrap="nowrap">
            <ThemeToggle />
            {user && (
              <Menu shadow="md" position="bottom-end">
                <Menu.Target>
                  <Box style={{ cursor: "pointer", display: "flex" }}>
                    <UserAvatar name={user?.name ?? "?"} avatarUrl={user?.avatar_url} size="sm" />
                  </Box>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>{user.email}</Menu.Label>
                  <Menu.Item
                    leftSection={<IconUsers size={16} />}
                    onClick={() => void renderDrawer(() => <InviteDrawer />).catch(() => {})}
                  >
                    Criar Conexão
                  </Menu.Item>
                  {user.is_admin && (
                    <Menu.Item
                      leftSection={<IconEyeglass size={16} />}
                      onClick={() => void renderDrawer(() => <ImpersonateUserDrawer />).catch(() => {})}
                      data-testid={AdminTestIds.MenuImpersonate}
                    >
                      Impersonar usuário
                    </Menu.Item>
                  )}
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
          </Group>
        </Group>
      </AppShell.Header>

      <ImpersonationBanner />

      <AppShell.Navbar p={0} visibleFrom="sm">
        <DesktopSidebar />
      </AppShell.Navbar>

      <AppShell.Main
        className="scroll-container"
        style={{
          height: "100dvh",
          overflow: "hidden auto",
          boxSizing: "border-box",
          paddingBottom: isMobile
            ? `calc(var(--mantine-spacing-md) + ${MOBILE_TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom))`
            : undefined,
        }}
      >
        <Outlet />
      </AppShell.Main>

      <Box hiddenFrom="sm">
        <MobileTabBar />
      </Box>

      <PWAInstallBanner />
    </AppShell>
  );
}
