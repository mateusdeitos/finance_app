import { Drawer, type DrawerProps } from '@mantine/core'
import { useRef, useState } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import classes from './ResponsiveDrawer.module.css'

const DRAG_DISMISS_THRESHOLD = 100
const DRAG_TAP_NOISE = 4
const SNAP_BACK_DURATION = 220
const DISMISS_DURATION = 200

/**
 * Mantine Drawer wrapper that switches between desktop (right-side, md width)
 * and mobile (bottom sheet, 85% height, rounded top, safe-area aware,
 * drag-to-dismiss).
 *
 * On mobile we render a real <button> grab handle at the top of the sheet.
 * It supports three interactions:
 *   - tap → calls onClose
 *   - drag down past DRAG_DISMISS_THRESHOLD → calls onClose
 *   - drag down less than threshold → snaps back via rAF
 * During the drag we override the drawer content's transform via Mantine's
 * `styles` prop. When we clear it (on release), Mantine's own transition
 * picks back up.
 *
 * Callers can still override any prop (position, size, radius, classNames) by
 * passing it explicitly — this component only fills in defaults.
 */
export function ResponsiveDrawer(props: DrawerProps) {
  const isMobile = useIsMobile()
  const [dragY, setDragY] = useState<number | null>(null)
  const startYRef = useRef(0)
  const suppressClickRef = useRef(false)
  const animRef = useRef<number | null>(null)

  if (!isMobile) {
    return <Drawer position="right" size="md" {...props} />
  }

  function cancelAnim() {
    if (animRef.current != null) {
      cancelAnimationFrame(animRef.current)
      animRef.current = null
    }
  }

  function snapBack(from: number) {
    cancelAnim()
    const start = performance.now()
    function tick(now: number) {
      const t = Math.min((now - start) / SNAP_BACK_DURATION, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setDragY(from * (1 - eased))
      if (t < 1) {
        animRef.current = requestAnimationFrame(tick)
      } else {
        animRef.current = null
        setDragY(null)
      }
    }
    animRef.current = requestAnimationFrame(tick)
  }

  function handleTouchStart(e: React.TouchEvent) {
    cancelAnim()
    startYRef.current = e.touches[0].clientY
    suppressClickRef.current = false
    setDragY(0)
  }

  function handleTouchMove(e: React.TouchEvent) {
    const dy = e.touches[0].clientY - startYRef.current
    if (Math.abs(dy) > DRAG_TAP_NOISE) suppressClickRef.current = true
    setDragY(Math.max(0, dy))
  }

  function dismissAnim(from: number) {
    cancelAnim()
    const target = window.innerHeight
    const start = performance.now()
    function tick(now: number) {
      const t = Math.min((now - start) / DISMISS_DURATION, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setDragY(from + (target - from) * eased)
      if (t < 1) {
        animRef.current = requestAnimationFrame(tick)
      } else {
        animRef.current = null
        // Keep dragY pinned off-screen so Mantine's exit transition is a
        // visual no-op (the component unmounts in ~300ms via renderDrawer's
        // teardown, which clears the state).
        props.onClose()
      }
    }
    animRef.current = requestAnimationFrame(tick)
  }

  function handleTouchEnd() {
    const finalY = dragY ?? 0
    if (!suppressClickRef.current) {
      // Pure tap — let the browser's synthesized click fire and call onClose.
      setDragY(null)
      return
    }
    if (finalY > DRAG_DISMISS_THRESHOLD) {
      dismissAnim(finalY)
    } else {
      snapBack(finalY)
    }
  }

  function handleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    props.onClose()
  }

  const callerContent = (props.classNames as { content?: string } | undefined)?.content
  const callerStyles = (props.styles as { content?: React.CSSProperties } | undefined) ?? {}
  const dragStyle: React.CSSProperties | undefined =
    dragY != null ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined

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
      styles={{
        ...props.styles,
        content: { ...callerStyles.content, ...dragStyle },
      }}
    >
      <button
        type="button"
        className={classes.dragHandle}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClick={handleClick}
        aria-label="Fechar"
      />
      {props.children}
    </Drawer>
  )
}
