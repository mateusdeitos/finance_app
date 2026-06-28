import { useMemo } from 'react'
import { useTransactions } from './useTransactions'
import { Transactions } from '@/types/transactions'

export interface RecurringSummary {
  /** Recurring installments whose first installment lands in the period. */
  starting: Transactions.Transaction[]
  /** Recurring installments whose last installment lands in the period. */
  ending: Transactions.Transaction[]
  /** Signed Σ of the starting installments (credit +, debit −), in cents. */
  startingTotal: number
  /** Signed Σ of the ending installments (credit +, debit −), in cents. */
  endingTotal: number
  isLoading: boolean
  isError: boolean
  invalidate: () => void
}

/** Returns 1-based installment count of a recurring transaction, or undefined. */
function totalInstallments(t: Transactions.Transaction): number | undefined {
  return t.transaction_recurrence?.installments
}

/**
 * Splits the period's recurring transactions into those starting
 * (installment_number === 1) and those ending (installment_number === total
 * installments) within the selected month, with the summed amount of each
 * group. Derives everything client-side from the existing transactions list,
 * which already preloads each transaction's recurrence.
 */
export function useRecurringForPeriod(month: number, year: number): RecurringSummary {
  const { query, invalidate } = useTransactions({ month, year })
  const transactions = query.data

  const { starting, ending, startingTotal, endingTotal } = useMemo(() => {
    const starting: Transactions.Transaction[] = []
    const ending: Transactions.Transaction[] = []

    for (const t of transactions ?? []) {
      if (t.transaction_recurrence_id == null || t.installment_number == null) continue
      const total = totalInstallments(t)
      if (t.installment_number === 1) starting.push(t)
      if (total != null && t.installment_number === total) ending.push(t)
    }

    // Net the amounts by operation type so the table footer matches the signed
    // per-row values (credit adds, debit subtracts) instead of summing raw
    // magnitudes.
    const sum = (list: Transactions.Transaction[]) =>
      list.reduce((s, t) => s + (t.operation_type === 'credit' ? t.amount : -t.amount), 0)
    return {
      starting,
      ending,
      startingTotal: sum(starting),
      endingTotal: sum(ending),
    }
  }, [transactions])

  return {
    starting,
    ending,
    startingTotal,
    endingTotal,
    isLoading: query.isLoading,
    isError: query.isError,
    invalidate,
  }
}
