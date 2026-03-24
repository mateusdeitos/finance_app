import { useSearch } from '@tanstack/react-router'
import { Transactions } from '@/types/transactions'

export function useActiveFilters(): Transactions.ActiveFilters {
  const search = useSearch({ from: '/_authenticated/transactions' })
  return {
    accountIds: search.accountIds,
    categoryIds: search.categoryIds,
    tagIds: search.tagIds,
    types: search.types,
  }
}
