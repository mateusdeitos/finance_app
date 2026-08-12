import { useMediaQuery } from '@mantine/hooks'

/**
 * True when the primary pointer is coarse — a phone or tablet.
 *
 * Deliberately distinct from `useIsMobile`, which is a *width* query. Width
 * tells you how much room the layout has; it does not tell you whether touch
 * gestures are available. A desktop window narrowed below the mobile
 * breakpoint is still driven by a mouse, and gestures like long-press never
 * fire there, so anything that replaces a visible control with a gesture must
 * key off this hook instead.
 *
 * Touch laptops usually report a fine primary pointer, so they keep the
 * visible controls — the safe fallback.
 */
export function useIsTouch() {
  return useMediaQuery('(pointer: coarse)')
}
