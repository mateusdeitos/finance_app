import { useCallback, useEffect, useRef } from 'react'

interface UseLongPressOptions {
  /** When false the gesture is inert (desktop, or already in selection mode). */
  enabled?: boolean
  /** Hold duration before the press fires. */
  delay?: number
  /** Finger travel (px) that cancels the press — lets swipe/scroll win. */
  moveTolerance?: number
}

/**
 * Touch long-press detector used to enter multi-select on mobile, where the
 * transaction rows deliberately carry no checkbox (the description needs the
 * row's full width — see TransactionRow).
 *
 * The browser still synthesizes a `click` after the finger lifts, which would
 * immediately toggle the row back off (or open the edit drawer). So once the
 * press has fired we swallow exactly one click via `onClickCapture`.
 */
export function useLongPress(
  onLongPress: () => void,
  { enabled = true, delay = 500, moveTolerance = 10 }: UseLongPressOptions = {},
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const firedRef = useRef(false)

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startRef.current = null
  }, [])

  useEffect(() => clear, [clear])

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || e.touches.length !== 1) return
      const touch = e.touches[0]
      startRef.current = { x: touch.clientX, y: touch.clientY }
      firedRef.current = false
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        firedRef.current = true
        onLongPress()
      }, delay)
    },
    [enabled, delay, onLongPress],
  )

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startRef.current || timerRef.current === null) return
      const touch = e.touches[0]
      const dx = Math.abs(touch.clientX - startRef.current.x)
      const dy = Math.abs(touch.clientY - startRef.current.y)
      if (dx > moveTolerance || dy > moveTolerance) clear()
    },
    [clear, moveTolerance],
  )

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!firedRef.current) return
    firedRef.current = false
    e.preventDefault()
    e.stopPropagation()
  }, [])

  // A long press on touch also raises `contextmenu` on some platforms; the
  // native menu would cover the selection bar we just opened.
  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (enabled && firedRef.current) e.preventDefault()
    },
    [enabled],
  )

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd: clear,
    onTouchCancel: clear,
    onClickCapture,
    onContextMenu,
  }
}
