import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAccounts } from '@/api/accounts'
import { QueryKeys } from '@/utils/queryKeys'

export function useAccounts() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.Accounts],
    queryFn: fetchAccounts,
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.Accounts] })
  return { query, invalidate }
}
