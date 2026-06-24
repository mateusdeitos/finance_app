import { useMemo } from 'react'
import { useCategorySpending } from './useCategorySpending'

/** A node in the income → expenses Sankey diagram. */
export interface FlowNode {
  name: string
  /** Display color for the node (income green, the central node neutral, expenses by category). */
  color: string
  /** Marks the leftover/savings node so the UI can label it distinctly. */
  kind: 'income' | 'hub' | 'expense' | 'leftover'
}

export interface FlowLink {
  source: number
  target: number
  /** Flow magnitude in cents (always > 0). */
  value: number
  color: string
}

export interface IncomeExpenseFlow {
  nodes: FlowNode[]
  links: FlowLink[]
  totalIncome: number
  totalExpense: number
  /** income − expense, in cents (the leftover routed to savings when positive). */
  leftover: number
  /** True once there is at least one income source to draw. */
  hasData: boolean
  isLoading: boolean
  isError: boolean
  invalidate: () => void
}

const INCOME_COLOR = '#3a8a5f'
const HUB_COLOR = '#457b9d'
const LEFTOVER_COLOR = '#2a9d8f'

/**
 * Builds a Sankey graph showing the period's money flow: each income category
 * flows into a central "Receita" hub, which then flows out to each expense
 * category (and to a "Sobra" node when income exceeds expenses). Reuses the
 * category aggregation from {@link useCategorySpending} so the numbers match the
 * Categorias view and the backend balance endpoint.
 */
export function useIncomeExpenseFlow(month: number, year: number): IncomeExpenseFlow {
  const { nodes: catNodes, categoriesLoading, spendLoading, isError, invalidate } =
    useCategorySpending(month, year)

  const flow = useMemo<Omit<IncomeExpenseFlow, 'isLoading' | 'isError' | 'invalidate'>>(() => {
    const incomeCats = catNodes
      .filter((n) => n.total > 0)
      .sort((a, b) => b.total - a.total)
    const expenseCats = catNodes
      .filter((n) => n.total < 0)
      .map((n) => ({ ...n, magnitude: -n.total }))
      .sort((a, b) => b.magnitude - a.magnitude)

    const totalIncome = incomeCats.reduce((s, n) => s + n.total, 0)
    const totalExpense = expenseCats.reduce((s, n) => s + n.magnitude, 0)
    const leftover = totalIncome - totalExpense

    const nodes: FlowNode[] = []
    const links: FlowLink[] = []

    // Index 0..N-1: income categories. Then the hub. Then expenses, then leftover.
    incomeCats.forEach((n) => nodes.push({ name: n.category.name, color: n.color, kind: 'income' }))
    const hubIndex = nodes.length
    nodes.push({ name: 'Receita', color: HUB_COLOR, kind: 'hub' })

    incomeCats.forEach((n, i) => {
      links.push({ source: i, target: hubIndex, value: n.total, color: INCOME_COLOR })
    })

    expenseCats.forEach((n) => {
      const idx = nodes.length
      nodes.push({ name: n.category.name, color: n.color, kind: 'expense' })
      links.push({ source: hubIndex, target: idx, value: n.magnitude, color: n.color })
    })

    if (leftover > 0) {
      const idx = nodes.length
      nodes.push({ name: 'Sobra', color: LEFTOVER_COLOR, kind: 'leftover' })
      links.push({ source: hubIndex, target: idx, value: leftover, color: LEFTOVER_COLOR })
    }

    return {
      nodes,
      links,
      totalIncome,
      totalExpense,
      leftover,
      hasData: incomeCats.length > 0 && links.length > 0,
    }
  }, [catNodes])

  return {
    ...flow,
    isLoading: categoriesLoading || spendLoading,
    isError,
    invalidate,
  }
}
