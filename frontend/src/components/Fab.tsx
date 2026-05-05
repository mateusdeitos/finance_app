import { ActionIcon, type MantineColor } from '@mantine/core'
import { ReactNode } from 'react'
import { tapHaptic } from '@/utils/haptics'
import classes from './Fab.module.css'

interface FabProps {
  onClick: () => void
  ariaLabel: string
  testId?: string
  color?: MantineColor
  children: ReactNode
}

/**
 * Floating action button anchored at the bottom-right of the viewport, above
 * the mobile tab bar (which lives at z-index 90 with height 56 + safe-area).
 * Mobile-only; the desktop layout uses inline page buttons instead.
 *
 * Each consumer is responsible for gating render with `useIsMobile()` — this
 * component doesn't gate itself so callers can keep the existing desktop
 * "Nova X" buttons intact and avoid double-rendering.
 */
export function Fab({ onClick, ariaLabel, testId, color = 'blue', children }: FabProps) {
  return (
    <ActionIcon
      size={56}
      radius="xl"
      variant="filled"
      color={color}
      className={classes.fab}
      onClick={() => {
        tapHaptic()
        onClick()
      }}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {children}
    </ActionIcon>
  )
}
