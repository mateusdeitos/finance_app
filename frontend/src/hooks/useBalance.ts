import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchBalance } from '@/api/transactions'
import { QueryKeys } from '@/utils/queryKeys'
import { Transactions } from '@/types/transactions'

export function useBalance<T = Transactions.BalanceResult>(
  params: Transactions.FetchBalanceParams,
  select?: (data: Transactions.BalanceResult) => T,
) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.Balance, params],
    queryFn: () => fetchBalance(params),
    select,
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.Balance] })
  return { query, invalidate }
}
