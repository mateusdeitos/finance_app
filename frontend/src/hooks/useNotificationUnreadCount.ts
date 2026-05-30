import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchNotificationUnreadCount } from '@/api/notifications'
import { QueryKeys } from '@/utils/queryKeys'
import { Notifications } from '@/types/notifications'

export function useNotificationUnreadCount<T = Notifications.UnreadCountResponse>(
  select?: (data: Notifications.UnreadCountResponse) => T,
) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.NotificationUnreadCount],
    queryFn: fetchNotificationUnreadCount,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    select,
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.NotificationUnreadCount] })
  return { query, invalidate }
}
