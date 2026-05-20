import { useEffect, useRef, useState } from 'react'
import { useDebouncedValue } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { checkDuplicatesBulk } from '@/api/transactions'
import { Transactions } from '@/types/transactions'
import { QueryKeys } from '@/utils/queryKeys'

interface Args {
  date: string
  amount: number
  description: string
  type: Transactions.TransactionType
  accountId: number
  /** Receives the latest transaction and settlement matches whenever a
   * re-check resolves. Both are overwritten on every result. */
  onResult: (result: {
    matches: Transactions.Transaction[]
    settlement_matches: Transactions.SettlementMatch[]
  }) => void
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
  type,
  accountId,
  onResult,
  debounceMs = 500,
  enabled = true,
}: Args) {
  const [debouncedDate] = useDebouncedValue(date, debounceMs)
  const [debouncedAmount] = useDebouncedValue(amount, debounceMs)
  const [debouncedDescription] = useDebouncedValue(description, debounceMs)
  const [debouncedType] = useDebouncedValue(type, debounceMs)

  // Captured once on mount: the CSV parse already returned matches for these
  // values, so a check only fires once a field differs from what was imported.
  const [initial] = useState({ date, amount, description, type })
  const fieldsChanged =
    debouncedDate !== initial.date ||
    debouncedAmount !== initial.amount ||
    debouncedDescription !== initial.description ||
    debouncedType !== initial.type

  const { data } = useQuery({
    queryKey: [
      QueryKeys.CheckDuplicate,
      debouncedDate,
      debouncedAmount,
      debouncedDescription,
      debouncedType,
      accountId,
    ],
    queryFn: async () => {
      const res = await checkDuplicatesBulk({
        account_id: accountId,
        rows: [
          {
            row_index: 0,
            date: debouncedDate,
            amount: debouncedAmount,
            description: debouncedDescription,
            type: debouncedType,
          },
        ],
      })
      const row = res.rows[0]
      return {
        matches: row?.matches ?? [],
        settlement_matches: row?.settlement_matches ?? [],
      }
    },
    enabled: enabled && !!debouncedDate && debouncedAmount > 0 && fieldsChanged,
    staleTime: Infinity,
  })

  const onResultRef = useRef(onResult)
  useEffect(() => {
    onResultRef.current = onResult
  })

  useEffect(() => {
    if (data) onResultRef.current(data)
  }, [data])
}
