/**
 * The FinanceApp brand mark — two interlocking rings (white + gold) on a
 * muted-blue rounded tile. Reuses the shipped PWA icon so the login screen,
 * the sidebar and the installed-app icon stay in sync.
 */
export function BrandLogo({ size = 32 }: { size?: number }) {
  return <img src="/icon.svg" width={size} height={size} alt="FinanceApp" />
}
