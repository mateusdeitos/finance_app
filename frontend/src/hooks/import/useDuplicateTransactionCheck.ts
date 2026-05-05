import { useEffect, useRef } from 'react'
import { useDebouncedValue } from '@mantine/hooks'
import { checkDuplicateTransaction } from '@/api/transactions'

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
}

/**
 * Re-checks the import row against the backend for duplicates whenever the
 * date / amount change (debounced). Skips the initial mount because the
 * backend already returned duplicate status for the parsed CSV.
 */
export function useDuplicateTransactionCheck({
  date,
  amount,
  accountId,
  getCurrentAction,
  setAction,
  debounceMs = 500,
}: Args) {
  const [debouncedDate] = useDebouncedValue(date, debounceMs)
  const [debouncedAmount] = useDebouncedValue(amount, debounceMs)

  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (!debouncedDate || !debouncedAmount || debouncedAmount <= 0) return

    void checkDuplicateTransaction({
      date: debouncedDate,
      amount: debouncedAmount,
      account_id: accountId,
    })
      .then((result) => {
        const currentAction = getCurrentAction()
        if (result.is_duplicate && currentAction === 'import') {
          setAction('duplicate')
        } else if (!result.is_duplicate && currentAction === 'duplicate') {
          setAction('import')
        }
      })
      .catch(() => {
        /* ignore network errors */
      })
    // Only react to the two debounced values; getCurrentAction/setAction
    // are stable RHF callbacks in practice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedDate, debouncedAmount])
}
