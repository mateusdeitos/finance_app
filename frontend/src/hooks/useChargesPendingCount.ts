import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchChargesPendingCount } from '@/api/charges'
import { QueryKeys } from '@/utils/queryKeys'

export function useChargesPendingCount<T = { count: number }>(
  select?: (data: { count: number }) => T,
) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.ChargesPendingCount],
    queryFn: fetchChargesPendingCount,
    staleTime: 60 * 1000,
    select,
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ChargesPendingCount] })
  return { query, invalidate }
}
