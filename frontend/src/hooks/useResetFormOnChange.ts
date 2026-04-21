import { useEffect } from 'react'
import type { UseFormReset, FieldValues } from 'react-hook-form'

export function useResetFormOnChange<T extends FieldValues>(
  reset: UseFormReset<T>,
  values: T | undefined,
) {
  useEffect(() => {
    if (values) reset(values)
  }, [values, reset])
}
