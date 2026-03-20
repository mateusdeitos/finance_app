import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchTags } from '@/api/tags'
import { QueryKeys } from '@/utils/queryKeys'

export function useTags() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.Tags],
    queryFn: fetchTags,
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.Tags] })
  return { query, invalidate }
}
