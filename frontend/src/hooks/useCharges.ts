import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCharges } from '@/api/charges'
import { QueryKeys } from '@/utils/queryKeys'
import { Charges } from '@/types/charges'

export function useCharges<T = Charges.ListResponse>(
  params: Charges.FetchParams,
  select?: (data: Charges.ListResponse) => T,
) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.Charges, params],
    queryFn: () => fetchCharges(params),
    select,
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.Charges] })
  return { query, invalidate }
}
