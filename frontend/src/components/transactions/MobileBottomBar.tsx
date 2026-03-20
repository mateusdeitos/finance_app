import { Group } from '@mantine/core'
import { type ReactNode } from 'react'
import classes from './MobileBottomBar.module.css'

interface MobileBottomBarProps {
  children: ReactNode
}

export function MobileBottomBar({ children }: MobileBottomBarProps) {
  return (
    <div className={classes.bar}>
      <Group gap="sm" justify="center">
        {children}
      </Group>
    </div>
  )
}
