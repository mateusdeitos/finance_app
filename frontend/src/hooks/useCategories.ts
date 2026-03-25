import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCategories } from '@/api/categories'
import { Transactions } from '@/types/transactions'
import { QueryKeys } from '@/utils/queryKeys'

export function useCategories<T = Transactions.Category[]>(select?: (data: Transactions.Category[]) => T) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.Categories],
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000,
    select,
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.Categories] })
  return { query, invalidate }
}
