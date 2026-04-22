import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchTransactions } from '@/api/transactions'
import { QueryKeys } from '@/utils/queryKeys'
import { Transactions } from '@/types/transactions'

export function useTransactions<T = Transactions.Transaction[]>(
  params: Transactions.FetchParams,
  select?: (data: Transactions.Transaction[]) => T,
) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.Transactions, params],
    queryFn: () => fetchTransactions(params),
    select,
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.Transactions] })
  return { query, invalidate }
}
