import { useEffect } from 'react'
import { useDebouncedValue } from '@mantine/hooks'
import { useNavigate } from '@tanstack/react-router'

/**
 * Debounces the controlled `value` and writes it to the `query` search param
 * on the `/transactions` route. Empty strings clear the param (set to undefined).
 */
export function useSyncTransactionsSearchQuery(value: string, delayMs = 300) {
  const navigate = useNavigate({ from: '/transactions' })
  const [debounced] = useDebouncedValue(value, delayMs)

  useEffect(() => {
    navigate({ search: (prev) => ({ ...prev, query: debounced || undefined }) })
    // Only react to debounced value changes; navigate is stable enough in practice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])
}
