import { useEffect } from 'react'
import { useDebouncedValue } from '@mantine/hooks'
import { useTransactionsSearch } from '@/hooks/useTransactionsSearch'

/**
 * Debounces the controlled `value` and writes it to the `query` search param
 * on the `/transactions` route. Empty strings clear the param. Uses
 * useTransactionsSearch so it works both inside the main route tree and
 * inside renderDrawer portals (which lack the matches context required by
 * useNavigate({ from: '/transactions' })).
 */
export function useSyncTransactionsSearchQuery(value: string, delayMs = 300) {
  const { update } = useTransactionsSearch()
  const [debounced] = useDebouncedValue(value, delayMs)

  useEffect(() => {
    update((prev) => ({ ...prev, query: debounced }))
    // Only react to debounced value changes; update is stable (useCallback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])
}
