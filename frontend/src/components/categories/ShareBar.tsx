import { CSSProperties } from 'react'
import classes from './ShareBar.module.css'

interface Props {
  /** Fill color (already tinted by the caller when needed). */
  color: string
  /** Fill width as a percentage 0–100. */
  pct: number
  height?: number
}

/** Horizontal participation bar: a tinted track with a colored fill. */
export function ShareBar({ color, pct, height = 6 }: Props) {
  const trackStyle = { '--cat-color': color, '--bar-height': `${height}px` } as CSSProperties
  const width = `${Math.min(100, Math.max(0, pct))}%`
  return (
    <div className={classes.track} style={trackStyle}>
      <div className={classes.fill} style={{ width }} />
    </div>
  )
}
