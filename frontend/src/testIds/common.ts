/**
 * Shared testids used across pages (AppLayout, cross-cutting drawers, etc.).
 *
 * Rules (mirror the registry-wide convention):
 * - Static keys are plain strings; parametric keys are factory functions that
 *   return a string literal union.
 * - Values live in snake_case to match the existing `data-testid` output;
 *   keys are PascalCase (following the QueryKeys convention).
 * - Import in both src/ and e2e/ via `@/testIds`.
 */
export const CommonTestIds = {
  DrawerInvite: 'drawer_invite',
  AvatarUser: 'avatar_user',
  AvatarAccount: 'avatar_account',
  AvatarAccountEmpty: 'avatar_account_empty',
  ThemeToggle: 'btn_theme_toggle',
  /**
   * NavLink badge, keyed by the route's path without the leading slash
   * (e.g. `nav_badge_charges` for `/charges`).
   */
  NavBadge: (route: string) => `nav_badge_${route}` as const,
  SidebarBrand: 'sidebar_brand',
  SidebarUserPill: 'sidebar_user_pill',
  SidebarUserMenu: 'sidebar_user_menu',
  NavCreateConnection: 'nav_create_connection',
  NavConnection: (connectionId: number) => `nav_connection_${connectionId}` as const,

  /* Edit connection drawer */
  DrawerEditConnection: 'drawer_edit_connection',
  EditConnectionNameInput: 'input_connection_name',
  EditConnectionSave: 'btn_save_connection',
  EditConnectionCancel: 'btn_cancel_connection',

  /* Invite drawer + accept-invite flow */
  InvitePartnerNameInput: 'input_invite_partner_name',
  InviteSplitChip: (pct: number) => `chip_invite_split_${pct}` as const,
  InviteSplitChipCustom: 'chip_invite_split_custom',
  InviteSplitCustomDec: 'btn_invite_split_custom_dec',
  InviteSplitCustomInc: 'btn_invite_split_custom_inc',
  InviteCopyLink: 'btn_invite_copy_link',
  ConnectWithAccept: 'btn_connect_with_accept',
  ConnectWithDecline: 'btn_connect_with_decline',
  ConnectWithGoToApp: 'btn_connect_with_go_to_app',
} as const
