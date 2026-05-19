import { useEffect, useRef, useState } from 'react'
import { useDebouncedValue } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { checkDuplicateTransaction } from '@/api/transactions'
import { Transactions } from '@/types/transactions'
import { QueryKeys } from '@/utils/queryKeys'

interface Args {
  date: string
  amount: number
  description: string
  accountId: number
  /** Receives the latest duplicate matches whenever a re-check resolves. */
  onResult: (matches: Transactions.Transaction[]) => void
  debounceMs?: number
  /** When false, the hook never calls the backend. Default `true`. */
  enabled?: boolean
}

/**
 * Re-checks an import row against the backend for possible duplicates whenever
 * its date, amount or description change (debounced).
 *
 * The duplicate warning is a recalculated signal, never sticky: the row keeps
 * the matches the CSV parse returned until a field edit triggers a fresh
 * check, at which point `onResult` overwrites them with the new result (which
 * may be empty, clearing the warning).
 *
 * The initial values are never re-fetched — the CSV parse already provides
 * matches for them. A check only fires once a field actually differs from
 * what was imported.
 */
export function useDuplicateTransactionCheck({
  date,
  amount,
  description,
  accountId,
  onResult,
  debounceMs = 500,
  enabled = true,
}: Args) {
  const [debouncedDate] = useDebouncedValue(date, debounceMs)
  const [debouncedAmount] = useDebouncedValue(amount, debounceMs)
  const [debouncedDescription] = useDebouncedValue(description, debounceMs)

  // Captured once on mount: the CSV parse already returned matches for these
  // values, so a check only fires once a field differs from what was imported.
  const [initial] = useState({ date, amount, description })
  const fieldsChanged =
    debouncedDate !== initial.date ||
    debouncedAmount !== initial.amount ||
    debouncedDescription !== initial.description

  const { data } = useQuery({
    queryKey: [
      QueryKeys.CheckDuplicate,
      debouncedDate,
      debouncedAmount,
      debouncedDescription,
      accountId,
    ],
    queryFn: () =>
      checkDuplicateTransaction({
        date: debouncedDate,
        amount: debouncedAmount,
        description: debouncedDescription,
        account_id: accountId,
      }),
    enabled: enabled && !!debouncedDate && debouncedAmount > 0 && fieldsChanged,
    staleTime: Infinity,
  })

  const onResultRef = useRef(onResult)
  useEffect(() => {
    onResultRef.current = onResult
  })

  useEffect(() => {
    if (data) onResultRef.current(data.matches)
  }, [data])
}
