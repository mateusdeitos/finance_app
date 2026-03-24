import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMe, Me } from '@/api/auth'
import { QueryKeys } from '@/utils/queryKeys'

export function useMe<T = Me>(select?: (data: Me) => T) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: [QueryKeys.Me], queryFn: fetchMe, staleTime: 5 * 60 * 1000, select })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [QueryKeys.Me] })
  return { query, invalidate }
}
