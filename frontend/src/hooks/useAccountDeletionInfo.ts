import { useQueryClient } from '@tanstack/react-query'
import { fetchAccountDeletionInfo, type AccountDeletionInfo } from '@/api/accounts'
import { QueryKeys } from '@/utils/queryKeys'

/**
 * Imperatively fetches the deletion impact for an account (linked transaction
 * count) on demand — used to decide whether to prompt before deleting. Goes
 * through TanStack Query's cache so repeated checks are deduplicated.
 */
export function useAccountDeletionInfo() {
  const queryClient = useQueryClient()

  const fetchInfo = (id: number): Promise<AccountDeletionInfo> =>
    queryClient.fetchQuery({
      queryKey: [QueryKeys.AccountDeletionInfo, id],
      queryFn: () => fetchAccountDeletionInfo(id),
      staleTime: 0,
    })

  return { fetchInfo }
}
