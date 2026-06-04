import { useMutation, useQueryClient, InfiniteData } from '@tanstack/react-query'
import { markAllNotificationsRead } from '@/api/notifications'
import { QueryKeys } from '@/utils/queryKeys'
import { Notifications } from '@/types/notifications'

type InboxCache = InfiniteData<Notifications.NotificationListResponse, unknown>

/**
 * Optimistic mark-all-read mutation.
 *
 * onMutate: sets EVERY notification across all pages to read=true in the
 * inbox infinite-data cache, AND zeroes the unread-count cache.
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
export function useMarkAllNotificationsRead(options?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),

    onMutate: async () => {
      // Cancel in-flight queries for both caches
      await queryClient.cancelQueries({ queryKey: [QueryKeys.Notifications] })
      await queryClient.cancelQueries({ queryKey: [QueryKeys.NotificationUnreadCount] })

      // Snapshot current state for rollback
      const prevInbox = queryClient.getQueryData<InboxCache>([QueryKeys.Notifications])
      const prevCount = queryClient.getQueryData<Notifications.UnreadCountResponse>([
        QueryKeys.NotificationUnreadCount,
      ])

      // Optimistically set every notification to read=true across all pages
      if (prevInbox) {
        queryClient.setQueryData<InboxCache>([QueryKeys.Notifications], {
          ...prevInbox,
          pages: prevInbox.pages.map((page) => ({
            ...page,
            notifications: page.notifications.map((n) => ({ ...n, read: true })),
          })),
        })
      }

      // Optimistically zero the unread count
      queryClient.setQueryData<Notifications.UnreadCountResponse>(
        [QueryKeys.NotificationUnreadCount],
        { count: 0 },
      )

      return { prevInbox, prevCount }
    },

    onError: (
      _e: unknown,
      _v: void,
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
