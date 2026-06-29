import { EMOJI_OPTIONS } from '@/components/categories/emojiOptions'

/**
 * Deterministic, on-brand color assignment for categories.
 *
 * Categories have no persisted color (see CLAUDE.md / data model), so the
 * Categorias spending view derives one client-side. Color is driven by the
 * category's emoji so it stays predictable — the same emoji always maps to the
 * same hue (🏠 blue, 🍔 orange, 💊 red, …), mirroring the design's hand-picked
 * sample. Categories without an emoji fall back to a stable hash of their id so
 * the color never shifts when the list is reordered.
 */
export const CATEGORY_PALETTE = [
  '#568fb3', // 0 brand blue  — home / utilities / nature
  '#2a9d8f', // 1 teal        — shopping / personal care
  '#d5660c', // 2 orange      — food & drink
  '#7048b8', // 3 violet      — transport / travel
  '#cb1425', // 4 red         — health / fitness
  '#5b6cb0', // 5 indigo      — leisure / entertainment
  '#457b9d', // 6 deep blue   — education / tech / work
  '#3a8a5f', // 7 green       — money / finance
] as const

// Palette index per emoji, aligned 1:1 with EMOJI_OPTIONS order. Grouped by
// the broad meaning of each emoji so related categories share a family hue.
// Tweak an entry here to recolor that emoji everywhere.
const EMOJI_PALETTE_INDEX = [
  0, 3, 2, 1, 4, 3, 5, 1, 6, 0, // 🏠 🚗 🍔 🛒 💊 ✈️ 🎬 👕 📚 💡
  4, 5, 0, 7, 7, 6, 5, 0, 2, 2, // 🏋️ 🎮 🐾 💰 🏦 📱 🎁 🌿 ☕ 🍺
  5, 4, 3, 3, 6, 6, 2, 2, 1, 6, // 🎵 🏥 ⛽ 🚌 🏫 💻 🍕 🍣 🧴 🛠️
  0, 4, 2, 7, 0, 0, 5, 6, 7, 1, // 🌟 ❤️ 🎂 🤝 🌊 🏔️ 🎯 🧾 💳 🏷️
] as const

/** Fixed emoji → color map. Built from EMOJI_OPTIONS so the keys match exactly. */
export const EMOJI_COLORS: Record<string, string> = Object.fromEntries(
  EMOJI_OPTIONS.map((emoji, i) => [emoji, CATEGORY_PALETTE[EMOJI_PALETTE_INDEX[i]]]),
)

/**
 * Returns a stable palette color for a category: by its emoji when set,
 * otherwise by a deterministic hash of its id.
 */
export function getCategoryColor(category: { emoji?: string; id: number }): string {
  if (category.emoji && EMOJI_COLORS[category.emoji]) return EMOJI_COLORS[category.emoji]
  const len = CATEGORY_PALETTE.length
  return CATEGORY_PALETTE[((category.id % len) + len) % len]
}

/** Builds an `rgba(...)` string from a `#rrggbb` hex and an alpha in [0, 1]. */
export function tintColor(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Returns a lighter solid `#rrggbb` shade of `hex`, mixing each channel toward
 * white by `amount` (0 = unchanged, 1 = white). Used to give a parent's
 * subcategories distinguishable tints of the same family hue.
 */
export function lightenColor(hex: string, amount: number): string {
  const h = hex.replace('#', '')
  const t = Math.max(0, Math.min(1, amount))
  const mix = (channel: number) => Math.round(channel + (255 - channel) * t)
  const to2 = (channel: number) => mix(channel).toString(16).padStart(2, '0')
  return `#${to2(parseInt(h.slice(0, 2), 16))}${to2(parseInt(h.slice(2, 4), 16))}${to2(parseInt(h.slice(4, 6), 16))}`
}
