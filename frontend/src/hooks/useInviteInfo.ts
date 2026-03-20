import { useQuery } from '@tanstack/react-query'
import { fetchInviteInfo } from '@/api/userConnections'
import { QueryKeys } from '@/utils/queryKeys'

export function useInviteInfo(externalId: string) {
  const query = useQuery({
    queryKey: [QueryKeys.InviteInfo, externalId],
    queryFn: () => fetchInviteInfo(externalId),
    enabled: !!externalId,
  })
  return { query }
}
