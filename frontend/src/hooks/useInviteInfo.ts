import { useQuery } from '@tanstack/react-query'
import { fetchInviteInfo, UserConnections } from '@/api/userConnections'
import { QueryKeys } from '@/utils/queryKeys'

export function useInviteInfo<T = UserConnections.InviteInfo>(
  externalId: string,
  select?: (data: UserConnections.InviteInfo) => T,
) {
  const query = useQuery({
    queryKey: [QueryKeys.InviteInfo, externalId],
    queryFn: () => fetchInviteInfo(externalId),
    enabled: !!externalId,
    select,
  })
  return { query }
}
