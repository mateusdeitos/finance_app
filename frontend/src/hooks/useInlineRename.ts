import { useRef, useState } from 'react'

/**
 * Encapsulates the in-place "click name → edit → commit on Enter/blur" flow
 * shared by category cards and subcategory rows.
 */
export function useInlineRename(currentName: string, onSave: (name: string) => Promise<void>) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const inputRef = useRef<HTMLInputElement>(null)

  function start() {
    setValue(currentName)
    setError(undefined)
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function commit() {
    const trimmed = value.trim()
    if (!trimmed || trimmed === currentName) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(trimmed)
      setEditing(false)
      setError(undefined)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  return { editing, value, setValue, saving, error, inputRef, start, commit, handleKeyDown }
}
