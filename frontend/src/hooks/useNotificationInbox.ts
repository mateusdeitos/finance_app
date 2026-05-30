import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { fetchNotifications } from '@/api/notifications'
import { QueryKeys } from '@/utils/queryKeys'

export function useNotificationInbox() {
  const queryClient = useQueryClient()
  const query = useInfiniteQuery({
    queryKey: [QueryKeys.Notifications],
    queryFn: ({ pageParam }) => fetchNotifications({ cursor: pageParam, limit: 20 }),
    initialPageParam: '' as string,
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : undefined),
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.Notifications] })
  return { query, invalidate }
}
