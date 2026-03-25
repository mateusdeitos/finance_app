import { useSearch } from '@tanstack/react-router'
import { useAccounts } from './useAccounts'
import { useCategories } from './useCategories'
import { useTags } from './useTags'
import { Transactions } from '@/types/transactions'

export function useActiveFilters(): Transactions.ActiveFilters {
  const search = useSearch({ from: '/_authenticated/transactions' })

  const { query: accountsQuery } = useAccounts((accounts) => {
    const valid = new Set(accounts.map((a) => a.id))
    return search.accountIds.filter((id) => valid.has(id))
  })
  const { query: categoriesQuery } = useCategories((categories) => {
    const valid = new Set(categories.map((c) => c.id))
    return search.categoryIds.filter((id) => valid.has(id))
  })
  const { query: tagsQuery } = useTags((tags) => {
    const valid = new Set(tags.map((t) => t.id))
    return search.tagIds.filter((id) => valid.has(id))
  })

  return {
    accountIds: accountsQuery.data ?? [],
    categoryIds: categoriesQuery.data ?? [],
    tagIds: tagsQuery.data ?? [],
    types: search.types,
  }
}
