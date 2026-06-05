import { useMutation } from '@tanstack/react-query'
import { sendTestNotification } from '@/api/notifications'

/**
 * Fires a backend-delivered test push notification to the current user's own
 * subscriptions so they can preview how a real notification renders on this
 * device.
 *
 * The push round-trips through the backend (POST /api/notifications/test) — it
 * is NOT a locally-faked `showNotification`, so what the user sees matches a
 * genuine notification end-to-end. No inbox row is persisted server-side, so
 * there is nothing to invalidate here.
 *
 * Returns { mutation } only — the caller owns the toast (per CLAUDE.md
 * "caller handles side effects" convention).
 */
export function useSendTestNotification(options?: {
  onSuccess?: () => void
  onError?: (error: Error) => void
}) {
  const mutation = useMutation({
    mutationFn: () => sendTestNotification(),
    onSuccess: options?.onSuccess,
    onError: (error: Error) => options?.onError?.(error),
  })

  return { mutation }
}
