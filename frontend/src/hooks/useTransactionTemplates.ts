import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchTransactionTemplates } from '@/api/transactionTemplates'
import { Transactions } from '@/types/transactions'
import { QueryKeys } from '@/utils/queryKeys'

export function useTransactionTemplates<T = Transactions.Template[]>(
  select?: (data: Transactions.Template[]) => T,
) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.TransactionTemplates],
    queryFn: fetchTransactionTemplates,
    staleTime: 5 * 60 * 1000,
    select,
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.TransactionTemplates] })
  return { query, invalidate }
}
