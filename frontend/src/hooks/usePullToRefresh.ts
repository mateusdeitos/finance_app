import { useEffect, useRef, useState } from 'react'
import { tapHaptic } from '@/utils/haptics'

const TRIGGER_DISTANCE = 70
const MAX_DISTANCE = 100

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
 * fights with regular vertical scroll. The container stays in DOM throughout the
 * SPA, so we listen on `document.querySelector('.scroll-container')` once.
 *
 * `pullDistance` (0..MAX_DISTANCE) is exposed so the caller can render a
 * progress indicator. `triggered` flips true past TRIGGER_DISTANCE while the
 * finger is still down, signalling "release to refresh".
 */
export function usePullToRefresh({ onRefresh, enabled = true }: UsePullToRefreshOptions): UsePullToRefreshResult {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [triggered, setTriggered] = useState(false)

  const startYRef = useRef<number | null>(null)
  const triggeredRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    if (!enabled) return

    const container = document.querySelector<HTMLElement>('.scroll-container')
    if (!container) return

    function handleStart(e: TouchEvent) {
      if (!container) return
      if (container.scrollTop > 0) {
        startYRef.current = null
        return
      }
      startYRef.current = e.touches[0].clientY
      triggeredRef.current = false
    }

    function handleMove(e: TouchEvent) {
      if (startYRef.current == null) return
      if (!container || container.scrollTop > 0) {
        startYRef.current = null
        setPullDistance(0)
        return
      }
      const dy = e.touches[0].clientY - startYRef.current
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
      if (startYRef.current == null) return
      const wasTriggered = triggeredRef.current
      startYRef.current = null
      triggeredRef.current = false
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
