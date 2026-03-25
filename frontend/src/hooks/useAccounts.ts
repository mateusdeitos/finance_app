import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAccounts } from '@/api/accounts'
import { Transactions } from '@/types/transactions'
import { QueryKeys } from '@/utils/queryKeys'

export function useAccounts<T = Transactions.Account[]>(select?: (data: Transactions.Account[]) => T) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.Accounts],
    queryFn: fetchAccounts,
    staleTime: 5 * 60 * 1000,
    select,
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.Accounts] })
  return { query, invalidate }
}
