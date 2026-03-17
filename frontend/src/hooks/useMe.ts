import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMe } from '@/api/auth'
import { QueryKeys } from '@/utils/queryKeys'

export function useMe() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: [QueryKeys.Me], queryFn: fetchMe })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [QueryKeys.Me] })
  return { query, invalidate }
}
