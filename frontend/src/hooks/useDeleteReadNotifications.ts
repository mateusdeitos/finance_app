import { useMutation, useQueryClient, InfiniteData } from '@tanstack/react-query'
import { deleteReadNotifications } from '@/api/notifications'
import { QueryKeys } from '@/utils/queryKeys'
import { Notifications } from '@/types/notifications'

type InboxCache = InfiniteData<Notifications.NotificationListResponse, unknown>

/**
 * Optimistic bulk hard-delete of READ notifications.
 *
 * onMutate: removes every read row from the inbox infinite-data cache. The
 * unread-count cache is left untouched — only read rows are removed, so the
 * unread total cannot change.
 *
 * onError: rolls back the inbox cache from the snapshot.
 *
 * onSettled: invalidates NotificationUnreadCount to reconcile with the server
 * (cross-cutting; lives in the hook per D-25-2). The count should not change,
 * but reconciling keeps the badge authoritative.
 *
 * onSuccess?: caller-supplied callback for inbox-list invalidation (per
 * CLAUDE.md "caller invalidates" convention).
 *
 * Returns { mutation } — no toast inside this hook.
 */
export function useDeleteReadNotifications(options?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => deleteReadNotifications(),

    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: [QueryKeys.Notifications] })

      const prevInbox = queryClient.getQueryData<InboxCache>([QueryKeys.Notifications])

      // Optimistically remove all READ rows; unread rows stay.
      if (prevInbox) {
        queryClient.setQueryData<InboxCache>([QueryKeys.Notifications], {
          ...prevInbox,
          pages: prevInbox.pages.map((page) => ({
            ...page,
            notifications: page.notifications.filter((n) => !n.read),
          })),
        })
      }

      return { prevInbox }
    },

    onError: (_e: unknown, _vars: void, ctx: { prevInbox: InboxCache | undefined } | undefined) => {
      if (ctx?.prevInbox !== undefined) {
        queryClient.setQueryData<InboxCache>([QueryKeys.Notifications], ctx.prevInbox)
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
