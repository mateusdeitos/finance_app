import { useMutation, useQueryClient, InfiniteData } from '@tanstack/react-query'
import { markNotificationRead } from '@/api/notifications'
import { QueryKeys } from '@/utils/queryKeys'
import { Notifications } from '@/types/notifications'

type InboxCache = InfiniteData<Notifications.NotificationListResponse, unknown>

/**
 * Optimistic mark-read mutation.
 *
 * onMutate: flips the matching notification to read=true in the inbox
 * infinite-data cache, AND decrements the unread-count cache by 1 (floor 0)
 * ONLY if the row was previously unread.
 *
 * onError: rolls back both caches from the snapshot.
 *
 * onSettled: invalidates NotificationUnreadCount so the badge reconciles with
 * the server (cross-cutting; lives in the hook per D-25-2).
 *
 * onSuccess?: caller-supplied callback for inbox-list invalidation (per
 * CLAUDE.md "caller invalidates" convention).
 *
 * Returns { mutation } — no toast inside this hook.
 */
export function useMarkNotificationRead(options?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (id: number) => markNotificationRead(id),

    onMutate: async (id: number) => {
      // Cancel in-flight queries for both caches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: [QueryKeys.Notifications] })
      await queryClient.cancelQueries({ queryKey: [QueryKeys.NotificationUnreadCount] })

      // Snapshot current state for rollback
      const prevInbox = queryClient.getQueryData<InboxCache>([QueryKeys.Notifications])
      const prevCount = queryClient.getQueryData<Notifications.UnreadCountResponse>([
        QueryKeys.NotificationUnreadCount,
      ])

      // Determine if the target notification was unread before the optimistic update
      let wasUnread = false
      if (prevInbox) {
        for (const page of prevInbox.pages) {
          const found = page.notifications.find((n) => n.id === id)
          if (found) {
            wasUnread = !found.read
            break
          }
        }
      }

      // Optimistically flip the notification to read=true in the inbox cache
      if (prevInbox) {
        queryClient.setQueryData<InboxCache>([QueryKeys.Notifications], {
          ...prevInbox,
          pages: prevInbox.pages.map((page) => ({
            ...page,
            notifications: page.notifications.map((n) =>
              n.id === id ? { ...n, read: true } : n,
            ),
          })),
        })
      }

      // Optimistically decrement the unread count (only if row was unread, floor at 0)
      if (wasUnread && prevCount != null) {
        queryClient.setQueryData<Notifications.UnreadCountResponse>(
          [QueryKeys.NotificationUnreadCount],
          { count: Math.max(0, prevCount.count - 1) },
        )
      }

      return { prevInbox, prevCount }
    },

    onError: (
      _e: unknown,
      _id: number,
      ctx: { prevInbox: InboxCache | undefined; prevCount: Notifications.UnreadCountResponse | undefined } | undefined,
    ) => {
      // Rollback both caches to their pre-mutation snapshots
      if (ctx?.prevInbox !== undefined) {
        queryClient.setQueryData<InboxCache>([QueryKeys.Notifications], ctx.prevInbox)
      }
      if (ctx?.prevCount !== undefined) {
        queryClient.setQueryData<Notifications.UnreadCountResponse>(
          [QueryKeys.NotificationUnreadCount],
          ctx.prevCount,
        )
      }
    },

    onSettled: () => {
      // Reconcile the unread-count badge with the server (cross-cutting; always in-hook)
      void queryClient.invalidateQueries({ queryKey: [QueryKeys.NotificationUnreadCount] })
    },

    onSuccess: () => {
      // Delegate inbox-list invalidation to the caller (per CLAUDE.md convention)
      options?.onSuccess?.()
    },
  })

  return { mutation }
}
