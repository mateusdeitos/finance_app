/**
 * Testids for the admin user-impersonation flow (menu entry, picker drawer,
 * and the active-session banner).
 */
export const AdminTestIds = {
  /* Entry point (user menu) */
  MenuImpersonate: 'menu_impersonate',

  /* Impersonation picker drawer */
  DrawerImpersonate: 'drawer_impersonate',
  ImpersonateSearchInput: 'input_impersonate_search',
  ImpersonateReasonInput: 'input_impersonate_reason',
  ImpersonateUserRow: (userId: number) => `row_impersonate_user_${userId}` as const,
  ImpersonateConfirm: 'btn_impersonate_confirm',
  ImpersonateError: 'alert_impersonate_error',

  /* Active-session banner */
  Banner: 'banner_impersonation',
  BannerStop: 'btn_impersonation_stop',
} as const
