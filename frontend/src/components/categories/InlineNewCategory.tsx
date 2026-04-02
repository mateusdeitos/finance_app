import { useEffect, useRef, useState } from 'react'
import { ActionIcon, Box, Group, Loader, Text, TextInput } from '@mantine/core'

interface Props {
  depth: number
  onSave: (name: string) => Promise<void>
  onCancel: () => void
}

export function InlineNewCategory({ depth, onSave, onCancel }: Props) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

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

  return (
    <Group
      gap={4}
      align="center"
      wrap="nowrap"
      style={{ paddingLeft: depth * 20 }}
    >
      {/* matches chevron spacer width */}
      <Box w={depth === 0 ? 34 : 30} />

      {/* emoji placeholder */}
      <ActionIcon variant="subtle" color="gray" size="md" disabled>
        <Text size="sm" c="dimmed" lh={1}>😀</Text>
      </ActionIcon>

      <TextInput
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') onCancel()
        }}
        placeholder="Nome da categoria"
        size="sm"
        style={{ minWidth: 160 }}
        rightSection={saving ? <Loader size={14} /> : null}
        data-testid="input_new_category_name"
      />
    </Group>
  )
}
