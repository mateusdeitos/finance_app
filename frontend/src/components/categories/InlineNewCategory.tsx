import { CSSProperties, useRef, useState } from 'react'
import { ActionIcon, Box, Group, Loader, Text, TextInput } from '@mantine/core'
import { useAutofocusRef } from '@/hooks/useAutofocusRef'
import { CategoriesTestIds } from '@/testIds'
import { CategoryTile } from './CategoryTile'
import classes from './InlineNewCategory.module.css'

interface Props {
  depth: number
  /**
   * 'plain' (default) — original indented Group layout, used by the flat-list
   * CategoryCard and the import-flow drawer.
   * 'card' — matches the Categorias spending cards: a card shell at root, a
   * rail-aligned row (elbow + tinted tile) as a child.
   */
  variant?: 'plain' | 'card'
  /** Parent category color — tints the child row's emoji tile and elbow (card variant). */
  color?: string
  onSave: (name: string) => Promise<void>
  onCancel: () => void
}

export function InlineNewCategory({ depth, variant = 'plain', color = '#8b8b8b', onSave, onCancel }: Props) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useAutofocusRef(inputRef)

  async function commit() {
    const trimmed = name.trim()
    if (!trimmed) { onCancel(); return }
    setSaving(true)
    try {
      await onSave(trimmed)
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') onCancel()
  }

  const input = (
    <TextInput
      ref={inputRef}
      className={variant === 'card' ? classes.input : undefined}
      value={name}
      onChange={(e) => setName(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      placeholder="Nome da categoria"
      size={variant === 'card' && depth > 0 ? 'xs' : 'sm'}
      style={variant === 'card' ? undefined : { minWidth: 160 }}
      rightSection={saving ? <Loader size={14} /> : null}
      data-testid={CategoriesTestIds.InputNewName}
    />
  )

  if (variant === 'card') {
    // Child row: align under the parent's connector rail (elbow + tinted tile).
    if (depth > 0) {
      return (
        <div className={classes.childRow} style={{ '--cat-color': color } as CSSProperties}>
          <div className={classes.elbow} />
          <CategoryTile color={color} emoji="😀" size={30} radius={9} />
          {input}
        </div>
      )
    }
    // Root: mirror the category card shell.
    return (
      <div className={classes.card}>
        <div className={classes.cardRow}>
          <CategoryTile color={color} emoji="😀" size={42} />
          {input}
        </div>
      </div>
    )
  }

  // Plain variant — original indented layout.
  return (
    <Group gap={4} align="center" wrap="nowrap" style={{ paddingLeft: depth * 20 }}>
      {/* matches chevron spacer width */}
      <Box w={depth === 0 ? 34 : 30} />

      {/* emoji placeholder */}
      <ActionIcon variant="subtle" color="gray" size="md" disabled>
        <Text size="sm" c="dimmed" lh={1}>😀</Text>
      </ActionIcon>

      {input}
    </Group>
  )
}
