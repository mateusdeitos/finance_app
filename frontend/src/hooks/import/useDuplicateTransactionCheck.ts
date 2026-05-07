import { useEffect, useRef } from 'react'
import { useDebouncedValue } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { checkDuplicateTransaction } from '@/api/transactions'
import { QueryKeys } from '@/utils/queryKeys'

interface Args {
  date: string
  amount: number
  accountId: number
  /**
   * Current action for the row. When `is_duplicate` is true and this is
   * `'import'`, the hook flips it to `'duplicate'`; when false and this is
   * `'duplicate'`, it flips back to `'import'`.
   */
  getCurrentAction: () => 'import' | 'skip' | 'duplicate'
  setAction: (action: 'import' | 'duplicate') => void
  debounceMs?: number
  /** When false, the hook never calls the backend. Default `true`. */
  enabled?: boolean
}

/**
 * Re-checks the import row against the backend for duplicates whenever the
 * date / amount change (debounced). Skips the initial mount because the
 * backend already returned duplicate status for the parsed CSV, and skips
 * `enabled: false → true` toggles when neither field has actually changed
 * (the user flipping the action between `import` ↔ `duplicate` should not
 * refire the request).
 */
export function useDuplicateTransactionCheck({
  date,
  amount,
  accountId,
  getCurrentAction,
  setAction,
  debounceMs = 500,
  enabled = true,
}: Args) {
  const [debouncedDate] = useDebouncedValue(date, debounceMs)
  const [debouncedAmount] = useDebouncedValue(amount, debounceMs)

  const initialRef = useRef({ date, amount })

  const fieldsChanged =
    debouncedDate !== initialRef.current.date ||
    debouncedAmount !== initialRef.current.amount

  const { data } = useQuery({
    queryKey: [QueryKeys.CheckDuplicate, debouncedDate, debouncedAmount, accountId],
    queryFn: () =>
      checkDuplicateTransaction({
        date: debouncedDate,
        amount: debouncedAmount,
        account_id: accountId,
      }),
    enabled:
      enabled &&
      !!debouncedDate &&
      debouncedAmount > 0 &&
      fieldsChanged,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (!data) return
    const currentAction = getCurrentAction()
    if (data.is_duplicate && currentAction === 'import') {
      setAction('duplicate')
    } else if (!data.is_duplicate && currentAction === 'duplicate') {
      setAction('import')
    }
    // getCurrentAction/setAction are stable RHF callbacks in practice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])
}
