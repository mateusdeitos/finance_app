import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCategories } from '@/api/categories'
import { QueryKeys } from '@/utils/queryKeys'

export function useCategories() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.Categories],
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000,
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.Categories] })
  return { query, invalidate }
}
