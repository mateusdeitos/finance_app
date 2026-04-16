import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCharges } from '@/api/charges'
import { QueryKeys } from '@/utils/queryKeys'
import { Charges } from '@/types/charges'

export function useCharges(params: Charges.FetchParams) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.Charges, params],
    queryFn: () => fetchCharges(params),
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.Charges] })
  return { query, invalidate }
}
