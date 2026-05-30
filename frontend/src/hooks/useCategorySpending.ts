import { useMemo } from 'react'
import { useCategories } from './useCategories'
import { useTransactions } from './useTransactions'
import { Transactions } from '@/types/transactions'
import { getCategoryColor } from '@/utils/categoryColors'

/** A category enriched with its monthly spend, transaction count and display color. */
export interface CategorySpendingNode {
  category: Transactions.Category
  /** Palette color for the category; subcategories inherit their parent's color. */
  color: string
  /** Aggregated expense for the period in cents (own transactions + descendants). */
  total: number
  /** Aggregated number of expense transactions (own + descendants). */
  count: number
  children: CategorySpendingNode[]
}

export interface CategorySpending {
  /** Top-level categories enriched with spend data, in API order. */
  nodes: CategorySpendingNode[]
  /** Sum of every category's aggregated spend for the period, in cents. */
  total: number
  /** Largest top-level aggregated spend, for scaling participation bars. */
  maxTotal: number
  isLoading: boolean
  isError: boolean
  invalidate: () => void
}

/**
 * Composes the categories tree with the period's transactions and computes
 * per-category spend totals, counts, participation and a stable color.
 *
 * Aggregation is frontend-only: it reuses the existing "transactions for a
 * period" endpoint (filtered to expenses) rather than a dedicated backend
 * endpoint. A transaction assigned to a subcategory rolls up into its parent.
 */
export function useCategorySpending(month: number, year: number): CategorySpending {
  const { query: categoriesQuery, invalidate } = useCategories()
  const { query: transactionsQuery } = useTransactions({ month, year, types: ['expense'] })

  const categories = categoriesQuery.data
  const transactions = transactionsQuery.data

  const { nodes, total, maxTotal } = useMemo(() => {
    const cats = categories ?? []
    const txns = transactions ?? []

    // Own (directly-assigned) spend per category id.
    //
    // A split/shared expense records the FULL amount on the payer's source
    // transaction, plus a settlement (settlements_from_source) for the share
    // the partner owes back: a `credit` settlement returns money to the payer
    // (reduces their spend), a `debit` settlement increases it. Settlements
    // carry no category of their own, so they are attributed to the source
    // transaction's category — matching how the backend balance endpoint nets
    // the settlement leg. This keeps the category total equal to the user's
    // real out-of-pocket spend for the period.
    const own = new Map<number, { total: number; count: number }>()
    for (const t of txns) {
      if (t.type !== 'expense' || t.category_id == null) continue
      const acc = own.get(t.category_id) ?? { total: 0, count: 0 }
      acc.total += Math.abs(t.amount)
      acc.count += 1
      for (const s of t.settlements_from_source ?? []) {
        acc.total += s.type === 'credit' ? -s.amount : s.amount
      }
      own.set(t.category_id, acc)
    }

    function build(category: Transactions.Category, color: string): CategorySpendingNode {
      const children = (category.children ?? []).map((child) => build(child, color))
      const self = own.get(category.id) ?? { total: 0, count: 0 }
      const total = self.total + children.reduce((s, c) => s + c.total, 0)
      const count = self.count + children.reduce((s, c) => s + c.count, 0)
      return { category, color, total, count, children }
    }

    const nodes = cats.map((category) => build(category, getCategoryColor(category)))
    const total = nodes.reduce((s, n) => s + n.total, 0)
    const maxTotal = nodes.reduce((m, n) => Math.max(m, n.total), 0)
    return { nodes, total, maxTotal }
  }, [categories, transactions])

  return {
    nodes,
    total,
    maxTotal,
    isLoading: categoriesQuery.isLoading || transactionsQuery.isLoading,
    isError: categoriesQuery.isError || transactionsQuery.isError,
    invalidate,
  }
}
