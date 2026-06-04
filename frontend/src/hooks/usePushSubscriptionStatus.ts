import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSubscriptionStatus } from '@/api/pushSubscriptions'
import { QueryKeys } from '@/utils/queryKeys'

interface UsePushSubscriptionStatusOptions {
  /** Only run the query when the browser supports push and permission is not denied. */
  enabled: boolean
}

async function fetchPushSubscriptionStatus(): Promise<{ subscribed: boolean }> {
  const registration = await navigator.serviceWorker.ready
  const sub = await registration.pushManager.getSubscription()
  if (!sub) {
    return { subscribed: false }
  }
  return fetchSubscriptionStatus(sub.endpoint)
}

export function usePushSubscriptionStatus<T = { subscribed: boolean }>(
  options: UsePushSubscriptionStatusOptions,
  select?: (data: { subscribed: boolean }) => T,
) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [QueryKeys.PushSubscription],
    queryFn: fetchPushSubscriptionStatus,
    enabled: options.enabled,
    staleTime: 60 * 1000,
    select,
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QueryKeys.PushSubscription] })
  return { query, invalidate }
}
