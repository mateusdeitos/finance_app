import { Drawer, type DrawerProps } from '@mantine/core'
import { useIsMobile } from '@/hooks/useIsMobile'
import classes from './ResponsiveDrawer.module.css'

/**
 * Mantine Drawer wrapper that switches between desktop (right-side, md width)
 * and mobile (bottom sheet, 85% height, rounded top, safe-area aware).
 *
 * The "Mobile First" guideline lives in frontend/CLAUDE.md; this component is
 * the single place that maps that guideline onto Mantine's Drawer API so each
 * drawer file doesn't have to repeat the breakpoint logic.
 *
 * Callers can still override any prop (position, size, radius, classNames) by
 * passing it explicitly — this component only fills in defaults.
 */
export function ResponsiveDrawer(props: DrawerProps) {
  const isMobile = useIsMobile()

  if (isMobile) {
    const callerContent = (props.classNames as { content?: string } | undefined)?.content
    return (
      <Drawer
        position="bottom"
        size="85%"
        radius="lg"
        {...props}
        classNames={{
          ...props.classNames,
          content: [classes.content, callerContent].filter(Boolean).join(' '),
        }}
      />
    )
  }

  return <Drawer position="right" size="md" {...props} />
}
