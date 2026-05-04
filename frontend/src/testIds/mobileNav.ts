/**
 * Testids for the mobile navigation chrome (bottom tab bar + "Mais" sheet + FAB
 * positioning, etc.). Desktop sidebar uses CommonTestIds.NavBadge for its
 * NavLink badges; the mobile tab bar reuses that factory for parity.
 */
export const MobileNavTestIds = {
  TabBar: 'mobile_tab_bar',
  Tab: (route: string) => `mobile_tab_${route}` as const,
  MoreTab: 'mobile_tab_more',
  MoreDrawer: 'mobile_more_drawer',
  MoreClose: 'mobile_more_close',
  MoreItem: (key: string) => `mobile_more_item_${key}` as const,
} as const
