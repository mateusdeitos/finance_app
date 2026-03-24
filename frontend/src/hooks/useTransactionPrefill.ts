import { useCallback } from 'react'
import { Transactions } from '@/types/transactions'

interface Prefill {
  date: string | null
  categoryId: number | null
  accountId: number | null
}

const PREFILL_KEY = (userId: number) => `create-transaction-prefill:${userId}`

function readPrefill(userId: number): Prefill {
  try {
    const raw = localStorage.getItem(PREFILL_KEY(userId))
    if (!raw) return { date: null, categoryId: null, accountId: null }
    return JSON.parse(raw) as Prefill
  } catch {
    return { date: null, categoryId: null, accountId: null }
  }
}

interface UseTransactionPrefillOptions {
  userId: number
  accounts: Transactions.Account[]
  categories: Transactions.Category[]
}

export function useTransactionPrefill({ userId, accounts, categories }: UseTransactionPrefillOptions) {
  const raw = readPrefill(userId)

  // Validate stored IDs against current data; discard stale values silently
  const accountExists = raw.accountId !== null && accounts.some((a) => a.id === raw.accountId)
  const categoryExists = raw.categoryId !== null && categories.some((c) => c.id === raw.categoryId)

  const prefill: Prefill = {
    date: raw.date,
    accountId: accountExists ? raw.accountId : null,
    categoryId: categoryExists ? raw.categoryId : null,
  }

  const savePrefill = useCallback(
    (date: string, categoryId: number | null, accountId: number | null) => {
      try {
        const value: Prefill = { date, categoryId, accountId }
        localStorage.setItem(PREFILL_KEY(userId), JSON.stringify(value))
      } catch {
        // localStorage may be unavailable; silently ignore
      }
    },
    [userId],
  )

  return { prefill, savePrefill }
}
