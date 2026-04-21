import { useQuery } from '@tanstack/react-query'
import { fetchBalance } from '@/api/transactions'
import { useActiveFilters } from '@/hooks/useActiveFilters'
import { QueryKeys } from '@/utils/queryKeys'
import { Transactions } from '@/types/transactions'

interface UseOpeningBalanceParams {
  month: number
  year: number
  accumulated: boolean
  hideSettlements?: boolean
}

export function useOpeningBalance<T = Transactions.BalanceResult>(
  { month, year, accumulated, hideSettlements }: UseOpeningBalanceParams,
  select?: (data: Transactions.BalanceResult) => T,
) {
  const filters = useActiveFilters()

  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year

  const query = useQuery({
    queryKey: [QueryKeys.Balance, { month: prevMonth, year: prevYear, accumulated, hideSettlements, ...filters }],
    queryFn: () =>
      fetchBalance({ month: prevMonth, year: prevYear, accumulated, hideSettlements, ...filters }),
    enabled: accumulated,
    select,
  })

  return { query }
}
