/**
 * Tiny wrappers around the Vibration API for native-feeling tactile feedback.
 * No-op on platforms without `navigator.vibrate` (iOS Safari, desktop browsers).
 *
 * Keep usage sparse — vibrate on intentional confirmations and selection
 * toggles, not on every render or hover. Excessive vibration drains battery
 * and feels gimmicky.
 */

function safeVibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined') return
  if (!('vibrate' in navigator)) return
  try {
    navigator.vibrate(pattern)
  } catch {
    // Some browsers throw if the document isn't yet user-activated; ignore.
  }
}

/** Lightweight tap — selection toggle, FAB press, tab switch. */
export function tapHaptic(): void {
  safeVibrate(10)
}

/** Confirmation pulse — bulk action committed, item deleted, refresh complete. */
export function successHaptic(): void {
  safeVibrate([10, 40, 10])
}

/** Warning pulse — destructive action revealed, error surfaced. */
export function warningHaptic(): void {
  safeVibrate([20, 60, 20])
}
