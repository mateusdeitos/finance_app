import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchTags } from '@/api/tags'
import { Transactions } from '@/types/transactions'
import { QueryKeys } from '@/utils/queryKeys'

export function useTags<T = Transactions.Tag[]>(select?: (data: Transactions.Tag[]) => T) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.Tags],
    queryFn: fetchTags,
    select,
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.Tags] })
  return { query, invalidate }
}
