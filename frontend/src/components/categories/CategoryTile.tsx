import { CSSProperties } from 'react'
import classes from './CategoryTile.module.css'

interface Props {
  color: string
  emoji?: string
  size?: number
  radius?: number
  onClick?: () => void
  title?: string
  testId?: string
}

/** Rounded tile showing a category emoji over a tonal wash of the category color. */
export function CategoryTile({ color, emoji, size = 42, radius = 12, onClick, title, testId }: Props) {
  const style = {
    '--cat-color': color,
    '--tile-size': `${size}px`,
    '--tile-radius': `${radius}px`,
    fontSize: size * 0.46,
  } as CSSProperties

  const content = emoji ?? <span className={classes.placeholder}>+😀</span>

  if (onClick) {
    return (
      <button
        type="button"
        className={classes.tile}
        style={style}
        onClick={onClick}
        title={title}
        data-testid={testId}
      >
        {content}
      </button>
    )
  }

  return (
    <div className={classes.tile} style={style} title={title} data-testid={testId}>
      {content}
    </div>
  )
}
