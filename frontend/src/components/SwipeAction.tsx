import { ReactNode, useRef, useState } from 'react'
import { tapHaptic, warningHaptic } from '@/utils/haptics'
import classes from './SwipeAction.module.css'

interface SwipeActionProps {
  children: ReactNode
  /** Label shown on the revealed action button. */
  actionLabel: string
  /** Action color (Mantine palette name, e.g. "red"). */
  actionColor?: string
  /** Optional testid for the action button (so e2e can drive it). */
  actionTestId?: string
  /** Triggered when the user taps the revealed action button. */
  onAction: () => void | Promise<void>
  /** When false, the gesture is disabled and children render unchanged. */
  enabled?: boolean
}

const TRIGGER_DISTANCE = 80
const MAX_DISTANCE = 120
const VERTICAL_TOLERANCE = 8

/**
 * Wraps a row in an iOS-style swipe-to-action gesture. Pure pointer events,
 * no third-party gesture library. Disambiguates against vertical scroll: a
 * horizontal swipe must dominate the gesture by VERTICAL_TOLERANCE pixels
 * before it captures.
 *
 * Reveals the action button on left-swipe; tap revealed → fires onAction.
 * Tap anywhere else while revealed → snaps back closed.
 */
export function SwipeAction({
  children,
  actionLabel,
  actionColor = 'red',
  actionTestId,
  onAction,
  enabled = true,
}: SwipeActionProps) {
  const [offset, setOffset] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const startXRef = useRef<number | null>(null)
  const startYRef = useRef<number | null>(null)
  const capturedRef = useRef(false)
  const baseOffsetRef = useRef(0)

  if (!enabled) {
    return <>{children}</>
  }

  function handleTouchStart(e: React.TouchEvent) {
    startXRef.current = e.touches[0].clientX
    startYRef.current = e.touches[0].clientY
    capturedRef.current = false
    baseOffsetRef.current = revealed ? -TRIGGER_DISTANCE : 0
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (startXRef.current == null || startYRef.current == null) return
    const dx = e.touches[0].clientX - startXRef.current
    const dy = e.touches[0].clientY - startYRef.current

    if (!capturedRef.current) {
      if (Math.abs(dx) <= Math.abs(dy) + VERTICAL_TOLERANCE) {
        // Vertical scroll wins — bail out of the swipe.
        startXRef.current = null
        return
      }
      capturedRef.current = true
    }

    const next = Math.max(-MAX_DISTANCE, Math.min(0, baseOffsetRef.current + dx))
    setOffset(next)
  }

  function handleTouchEnd() {
    if (startXRef.current == null) return
    startXRef.current = null
    startYRef.current = null
    capturedRef.current = false

    if (offset <= -TRIGGER_DISTANCE) {
      if (!revealed) tapHaptic()
      setRevealed(true)
      setOffset(-TRIGGER_DISTANCE)
    } else {
      setRevealed(false)
      setOffset(0)
    }
  }

  function handleAction(e: React.MouseEvent | React.TouchEvent) {
    e.stopPropagation()
    warningHaptic()
    setRevealed(false)
    setOffset(0)
    void onAction()
  }

  function handleRowClick(e: React.MouseEvent) {
    if (revealed) {
      e.stopPropagation()
      setRevealed(false)
      setOffset(0)
    }
  }

  return (
    <div className={classes.wrapper}>
      <button
        type="button"
        className={classes.action}
        style={{ background: `var(--mantine-color-${actionColor}-6)` }}
        onClick={handleAction}
        data-testid={actionTestId}
        aria-label={actionLabel}
        tabIndex={revealed ? 0 : -1}
      >
        {actionLabel}
      </button>
      <div
        className={classes.foreground}
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClickCapture={handleRowClick}
      >
        {children}
      </div>
    </div>
  )
}
