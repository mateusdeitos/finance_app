import { useQuery } from '@tanstack/react-query'
import { useDebouncedValue } from '@mantine/hooks'
import { fetchTransactionSuggestions } from '@/api/transactions'
import { QueryKeys } from '@/utils/queryKeys'

export function useTransactionSuggestions(query: string) {
  const [debounced] = useDebouncedValue(query, 300)

  const result = useQuery({
    queryKey: [QueryKeys.Transactions, 'suggestions', debounced],
    queryFn: () => fetchTransactionSuggestions(debounced, 10),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  })

  return result
}
