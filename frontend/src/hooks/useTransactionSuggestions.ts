import { useQuery } from '@tanstack/react-query'
import { useDebouncedValue } from '@mantine/hooks'
import { fetchTransactionSuggestions } from '@/api/transactions'
import { Transactions } from '@/types/transactions'
import { QueryKeys } from '@/utils/queryKeys'

export function useTransactionSuggestions<T = Transactions.TransactionSuggestion[]>(
  query: string,
  select?: (data: Transactions.TransactionSuggestion[]) => T,
) {
  const [debounced] = useDebouncedValue(query, 300)

  return useQuery({
    queryKey: [QueryKeys.Transactions, 'suggestions', debounced],
    queryFn: () => fetchTransactionSuggestions(debounced, 10),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
    select,
  })
}
