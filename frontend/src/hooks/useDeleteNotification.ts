import { useMutation, useQueryClient, InfiniteData } from '@tanstack/react-query'
import { deleteNotification } from '@/api/notifications'
import { QueryKeys } from '@/utils/queryKeys'
import { Notifications } from '@/types/notifications'

type InboxCache = InfiniteData<Notifications.NotificationListResponse, unknown>

/**
 * Optimistic single hard-delete mutation.
 *
 * onMutate: removes the matching notification from the inbox infinite-data
 * cache, AND decrements the unread-count cache by 1 (floor 0) ONLY if the
 * removed row was unread.
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
export function useDeleteNotification(options?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (id: number) => deleteNotification(id),

    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: [QueryKeys.Notifications] })
      await queryClient.cancelQueries({ queryKey: [QueryKeys.NotificationUnreadCount] })

      const prevInbox = queryClient.getQueryData<InboxCache>([QueryKeys.Notifications])
      const prevCount = queryClient.getQueryData<Notifications.UnreadCountResponse>([
        QueryKeys.NotificationUnreadCount,
      ])

      // Determine if the target notification was unread before removal
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

      // Optimistically remove the row from the inbox cache
      if (prevInbox) {
        queryClient.setQueryData<InboxCache>([QueryKeys.Notifications], {
          ...prevInbox,
          pages: prevInbox.pages.map((page) => ({
            ...page,
            notifications: page.notifications.filter((n) => n.id !== id),
          })),
        })
      }

      // Decrement unread count only if the removed row was unread (floor 0)
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
      void queryClient.invalidateQueries({ queryKey: [QueryKeys.NotificationUnreadCount] })
    },

    onSuccess: () => {
      options?.onSuccess?.()
    },
  })

  return { mutation }
}
