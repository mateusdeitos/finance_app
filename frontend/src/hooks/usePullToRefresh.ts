import { useEffect, useRef, useState } from 'react'
import { tapHaptic } from '@/utils/haptics'

const TRIGGER_DISTANCE = 70
const MAX_DISTANCE = 100
const HORIZONTAL_BIAS = 6

interface UsePullToRefreshOptions {
  onRefresh: () => void | Promise<unknown>
  enabled?: boolean
}

interface UsePullToRefreshResult {
  pullDistance: number
  isRefreshing: boolean
  triggered: boolean
}

/**
 * Native-style pull-to-refresh on the AppShell scroll container (`.scroll-container`).
 * Activates only when the page is already scrolled to the very top, so it never
 * fights with regular vertical scroll. Bails out when the gesture is dominated
 * by horizontal motion so it doesn't clash with row-level swipe actions
 * (`SwipeAction`).
 */
export function usePullToRefresh({ onRefresh, enabled = true }: UsePullToRefreshOptions): UsePullToRefreshResult {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [triggered, setTriggered] = useState(false)

  const startXRef = useRef<number | null>(null)
  const startYRef = useRef<number | null>(null)
  const verticalRef = useRef<boolean | null>(null)
  const triggeredRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    if (!enabled) return

    const container = document.querySelector<HTMLElement>('.scroll-container')
    if (!container) return

    function reset() {
      startXRef.current = null
      startYRef.current = null
      verticalRef.current = null
      triggeredRef.current = false
    }

    function handleStart(e: TouchEvent) {
      if (!container) return
      if (container.scrollTop > 0) {
        reset()
        return
      }
      startXRef.current = e.touches[0].clientX
      startYRef.current = e.touches[0].clientY
      verticalRef.current = null
      triggeredRef.current = false
    }

    function handleMove(e: TouchEvent) {
      if (startXRef.current == null || startYRef.current == null) return
      if (!container || container.scrollTop > 0) {
        reset()
        setPullDistance(0)
        return
      }
      const dx = e.touches[0].clientX - startXRef.current
      const dy = e.touches[0].clientY - startYRef.current

      // Disambiguate gesture direction once movement crosses the noise floor.
      // A horizontal-dominant swipe belongs to SwipeAction, not PTR.
      if (verticalRef.current == null) {
        if (Math.abs(dx) < HORIZONTAL_BIAS && Math.abs(dy) < HORIZONTAL_BIAS) return
        if (Math.abs(dx) > Math.abs(dy)) {
          verticalRef.current = false
          reset()
          setPullDistance(0)
          return
        }
        verticalRef.current = true
      }

      if (!verticalRef.current) return
      if (dy <= 0) {
        setPullDistance(0)
        return
      }
      // Rubber-band easing: distance grows but resists past trigger point.
      const eased = Math.min(dy * 0.5, MAX_DISTANCE)
      setPullDistance(eased)

      const nextTriggered = eased >= TRIGGER_DISTANCE
      if (nextTriggered && !triggeredRef.current) {
        triggeredRef.current = true
        setTriggered(true)
        tapHaptic()
      } else if (!nextTriggered && triggeredRef.current) {
        triggeredRef.current = false
        setTriggered(false)
      }
    }

    async function handleEnd() {
      if (startXRef.current == null) return
      const wasTriggered = triggeredRef.current
      reset()
      setTriggered(false)
      if (wasTriggered) {
        setIsRefreshing(true)
        setPullDistance(TRIGGER_DISTANCE)
        try {
          await onRefreshRef.current()
        } finally {
          setIsRefreshing(false)
          setPullDistance(0)
        }
      } else {
        setPullDistance(0)
      }
    }

    container.addEventListener('touchstart', handleStart, { passive: true })
    container.addEventListener('touchmove', handleMove, { passive: true })
    container.addEventListener('touchend', handleEnd, { passive: true })
    container.addEventListener('touchcancel', handleEnd, { passive: true })

    return () => {
      container.removeEventListener('touchstart', handleStart)
      container.removeEventListener('touchmove', handleMove)
      container.removeEventListener('touchend', handleEnd)
      container.removeEventListener('touchcancel', handleEnd)
    }
  }, [enabled])

  return { pullDistance, isRefreshing, triggered }
}
