import { Group, Kbd } from '@mantine/core'

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent)

export const MOD_LABEL = isMac ? '⌘' : 'Ctrl'

interface ShortcutHintProps {
  /** Pre-rendered key labels — caller decides the modifier label (e.g. via MOD_LABEL). */
  keys: string[]
}

/**
 * Inline `Kbd` group rendered next to a button label to advertise a keyboard
 * shortcut. Hidden on mobile (no physical keyboard) via a CSS breakpoint, so
 * it never flashes and stays hidden even inside the isolated drawer roots.
 */
export function ShortcutHint({ keys }: ShortcutHintProps) {
  return (
    <Group gap={4} wrap="nowrap" aria-hidden visibleFrom="sm">
      {keys.map((k) => (
        <Kbd key={k} size="xs">
          {k}
        </Kbd>
      ))}
    </Group>
  )
}
