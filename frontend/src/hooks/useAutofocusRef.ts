import { useEffect } from 'react'
import type { RefObject } from 'react'

export function useAutofocusRef(ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>) {
  useEffect(() => {
    ref.current?.focus()
  }, [ref])
}
