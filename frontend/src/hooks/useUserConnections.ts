import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchUserConnections, UserConnections } from '@/api/userConnections'
import { QueryKeys } from '@/utils/queryKeys'

export function useUserConnections<T = UserConnections.Connection[]>(
  select?: (data: UserConnections.Connection[]) => T,
) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.UserConnections],
    queryFn: fetchUserConnections,
    select,
  })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [QueryKeys.UserConnections] })
  return { query, invalidate }
}
