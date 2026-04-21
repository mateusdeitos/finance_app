import { useEffect } from 'react'
import type { FieldPath, FieldValues, UseFormSetFocus } from 'react-hook-form'

export function useFocusFieldOnMount<T extends FieldValues>(
  setFocus: UseFormSetFocus<T>,
  field: FieldPath<T> | undefined,
) {
  useEffect(() => {
    if (!field) return
    const timeout = setTimeout(() => setFocus(field), 0)
    return () => clearTimeout(timeout)
    // Focus on mount only; re-running on field change would fight user interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
