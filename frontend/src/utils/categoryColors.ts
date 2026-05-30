/**
 * Deterministic, on-brand color assignment for categories.
 *
 * Categories have no persisted color (see CLAUDE.md / data model), so the
 * Categorias spending view derives one client-side from a fixed palette. The
 * palette is lifted from the FinanceApp design system so the page stays
 * on-brand; subcategories tint their parent's color rather than getting their
 * own hue.
 */
export const CATEGORY_PALETTE = [
  '#568fb3', // brand blue
  '#2a9d8f', // teal
  '#d5660c', // orange
  '#7048b8', // violet
  '#cb1425', // red
  '#5b6cb0', // indigo
  '#457b9d', // deep blue
  '#3a8a5f', // green
] as const

/** Returns a stable palette color for a category given its position in the list. */
export function getCategoryColor(index: number): string {
  return CATEGORY_PALETTE[((index % CATEGORY_PALETTE.length) + CATEGORY_PALETTE.length) % CATEGORY_PALETTE.length]
}

/** Builds an `rgba(...)` string from a `#rrggbb` hex and an alpha in [0, 1]. */
export function tintColor(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
