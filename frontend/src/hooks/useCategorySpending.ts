import { useMemo } from 'react'
import { useCategories } from './useCategories'
import { useTransactions } from './useTransactions'
import { Transactions } from '@/types/transactions'
import { getCategoryColor } from '@/utils/categoryColors'

/** A category enriched with its signed monthly net, transaction count and display color. */
export interface CategorySpendingNode {
  category: Transactions.Category
  /** Palette color for the category; subcategories inherit their parent's color. */
  color: string
  /**
   * Signed net for the period in cents: income (credit) is positive, expense
   * (debit) negative. Transfers are excluded; settlements carry no category of
   * their own and are netted into their source transaction's category
   * (credit adds back, debit subtracts), matching the backend balance endpoint.
   * Aggregated over the category's own transactions plus all descendants.
   */
  total: number
  /** Number of income/expense transactions directly assigned (own + descendants). */
  count: number
  children: CategorySpendingNode[]
}

export interface CategorySpending {
  /** Top-level categories enriched with net data, in API order. */
  nodes: CategorySpendingNode[]
  /** Σ of every category's signed net — the period balance (receitas − despesas). */
  net: number
  /** Σ of |net| across categories — denominator for participation %/bars. */
  gross: number
  /** Largest |net| among top-level categories, for scaling participation bars. */
  maxAbs: number
  /** The categories tree is still loading (nothing to render yet). */
  categoriesLoading: boolean
  /** Categories are known but the period's amounts are still loading. */
  spendLoading: boolean
  isError: boolean
  invalidate: () => void
}

/**
 * Composes the categories tree with the period's income + expense transactions
 * and computes a signed net per category, plus the gross magnitude used for
 * participation. Aggregation is frontend-only: it reuses the existing
 * "transactions for a period" endpoint (expense + income, never transfers).
 */
export interface CategorySpendingOptions {
  /**
   * When true, settlements are ignored so each category reflects the raw
   * income/expense amounts (the "não considerar acertos" toggle on the home
   * dashboard). Defaults to false, matching the backend balance endpoint which
   * nets settlements into the source transaction's category.
   */
  hideSettlements?: boolean
}

export function useCategorySpending(
  month: number,
  year: number,
  options: CategorySpendingOptions = {},
): CategorySpending {
  const { hideSettlements = false } = options
  const { query: categoriesQuery, invalidate } = useCategories()
  const { query: transactionsQuery } = useTransactions({ month, year, types: ['expense', 'income'] })

  const categories = categoriesQuery.data
  const transactions = transactionsQuery.data

  const { nodes, net, gross, maxAbs } = useMemo(() => {
    const cats = categories ?? []
    const txns = transactions ?? []

    // Signed net per category id. Credit (income / returned settlement) adds,
    // debit (expense / owed settlement) subtracts. Transfers are filtered out;
    // settlements have no category, so they net into the source transaction's
    // category — matching how the backend balance endpoint nets the settlement
    // leg (unless hideSettlements is set, which ignores them entirely).
    const own = new Map<number, { total: number; count: number }>()
    for (const t of txns) {
      if (t.type === 'transfer' || t.category_id == null) continue
      const acc = own.get(t.category_id) ?? { total: 0, count: 0 }
      acc.total += t.operation_type === 'credit' ? t.amount : -t.amount
      acc.count += 1
      if (!hideSettlements) {
        for (const s of t.settlements_from_source ?? []) {
          acc.total += s.type === 'credit' ? s.amount : -s.amount
        }
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
    const net = nodes.reduce((s, n) => s + n.total, 0)
    const gross = nodes.reduce((s, n) => s + Math.abs(n.total), 0)
    const maxAbs = nodes.reduce((m, n) => Math.max(m, Math.abs(n.total)), 0)
    return { nodes, net, gross, maxAbs }
  }, [categories, transactions, hideSettlements])

  return {
    nodes,
    net,
    gross,
    maxAbs,
    categoriesLoading: categoriesQuery.isLoading,
    spendLoading: transactionsQuery.isLoading,
    isError: categoriesQuery.isError || transactionsQuery.isError,
    invalidate,
  }
}
