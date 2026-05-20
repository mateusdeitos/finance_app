import { useEffect, useRef } from 'react'

interface ParsedHotkey {
  key: string
  mod: boolean
  shift: boolean
  alt: boolean
}

function parseHotkey(spec: string): ParsedHotkey {
  const parts = spec.toLowerCase().split('+').map((p) => p.trim())
  return {
    mod: parts.includes('mod') || parts.includes('ctrl') || parts.includes('cmd'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key: parts[parts.length - 1],
  }
}

function matches(event: KeyboardEvent, hk: ParsedHotkey): boolean {
  const mod = event.ctrlKey || event.metaKey
  if (hk.mod !== mod) return false
  if (hk.shift !== event.shiftKey) return false
  if (hk.alt !== event.altKey) return false
  return event.key.toLowerCase() === hk.key
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

function isModalOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null
}

interface UseHotkeyOptions {
  enabled?: boolean
  /** When true, fires even if focus is in an input/textarea (needed for in-form submits). */
  allowInTyping?: boolean
  /** When true, fires even if a modal/drawer is open (the default suppresses page hotkeys while a drawer is up). */
  allowWithModal?: boolean
}

/**
 * Page-level keyboard shortcut. By default it is suppressed while the user is
 * typing in a field or while a Mantine drawer/modal is open, so a stray `n`
 * inside a search box won't open the create drawer.
 */
export function useHotkey(spec: string, callback: () => void, options: UseHotkeyOptions = {}) {
  const { enabled = true, allowInTyping = false, allowWithModal = false } = options

  const callbackRef = useRef(callback)
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (!enabled) return
    const hk = parseHotkey(spec)

    function handler(event: KeyboardEvent) {
      if (!matches(event, hk)) return
      if (!allowInTyping && isTypingTarget(event.target)) return
      if (!allowWithModal && isModalOpen()) return
      event.preventDefault()
      callbackRef.current()
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [spec, enabled, allowInTyping, allowWithModal])
}
