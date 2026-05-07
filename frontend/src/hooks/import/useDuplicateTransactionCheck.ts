import { useEffect, useRef } from 'react'
import { useDebouncedValue } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { checkDuplicateTransaction } from '@/api/transactions'
import { QueryKeys } from '@/utils/queryKeys'

type RowAction = 'import' | 'skip' | 'duplicate'

interface Args {
  date: string
  amount: number
  accountId: number
  /**
   * Current action for the row (watched via the parent form). The hook reads
   * this at data-arrival time to decide whether to auto-flip, and uses
   * changes in this value to detect user-initiated overrides — which lock
   * the row from any further auto-flips.
   */
  action: RowAction
  setAction: (action: 'import' | 'duplicate') => void
  debounceMs?: number
  /** When false, the hook never calls the backend. Default `true`. */
  enabled?: boolean
}

/**
 * Re-checks the import row against the backend for duplicates whenever the
 * date / amount change (debounced).
 *
 * Two important guarantees:
 *
 * 1. The same `(date, amount, accountId)` tuple is fetched at most once
 *    (TanStack Query cache + `staleTime: Infinity`). Toggling the action
 *    select without editing fields never re-fires the backend.
 *
 * 2. Once the user has manually changed the row's action, the hook stops
 *    auto-flipping for that row — even if a later edit surfaces a backend
 *    collision. Their explicit choice wins over our heuristic.
 */
export function useDuplicateTransactionCheck({
  date,
  amount,
  accountId,
  action,
  setAction,
  debounceMs = 500,
  enabled = true,
}: Args) {
  const [debouncedDate] = useDebouncedValue(date, debounceMs)
  const [debouncedAmount] = useDebouncedValue(amount, debounceMs)

  const initialRef = useRef({ date, amount })
  const userOverrodeRef = useRef(false)
  // Track the last `action` we observed so we can tell apart "user changed
  // the select" from "the hook just programmatically flipped". When the hook
  // calls setAction it stashes the target in `hookSetActionToRef`; any other
  // transition is treated as a user override.
  const lastActionRef = useRef(action)
  const hookSetActionToRef = useRef<RowAction | null>(null)

  useEffect(() => {
    if (action === lastActionRef.current) return
    if (hookSetActionToRef.current === action) {
      hookSetActionToRef.current = null
    } else {
      userOverrodeRef.current = true
    }
    lastActionRef.current = action
  }, [action])

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
    if (userOverrodeRef.current) return
    if (data.is_duplicate && action === 'import') {
      hookSetActionToRef.current = 'duplicate'
      setAction('duplicate')
    } else if (!data.is_duplicate && action === 'duplicate') {
      hookSetActionToRef.current = 'import'
      setAction('import')
    }
    // `action` and `setAction` are tracked via refs/closures; only re-run on data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])
}
