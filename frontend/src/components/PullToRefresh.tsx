import { Loader } from '@mantine/core'
import { ReactNode } from 'react'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { useIsMobile } from '@/hooks/useIsMobile'
import classes from './PullToRefresh.module.css'

interface PullToRefreshProps {
  onRefresh: () => void | Promise<unknown>
  enabled?: boolean
  children: ReactNode
}

/**
 * Native-style pull-to-refresh wrapper. Mobile-only — desktop pass-through.
 * Renders a small loader pill below the header that follows the user's pull
 * gesture and snaps to a refresh state when released past the threshold.
 *
 * The actual gesture detection lives in `usePullToRefresh`, which targets
 * `.scroll-container` (the AppShell.Main scroll viewport).
 */
export function PullToRefresh({ onRefresh, enabled = true, children }: PullToRefreshProps) {
  const isMobile = useIsMobile()
  const active = isMobile && enabled
  const { pullDistance, isRefreshing, triggered } = usePullToRefresh({
    onRefresh,
    enabled: active,
  })

  const visible = active && (pullDistance > 0 || isRefreshing)
  const offset = isRefreshing ? 70 : pullDistance

  return (
    <>
      {visible && (
        <div
          className={classes.indicator}
          style={{ transform: `translate(-50%, ${offset}px)` }}
          data-triggered={triggered ? '' : undefined}
          data-refreshing={isRefreshing ? '' : undefined}
        >
          <Loader size="sm" type={isRefreshing ? 'oval' : 'dots'} />
        </div>
      )}
      {children}
    </>
  )
}
