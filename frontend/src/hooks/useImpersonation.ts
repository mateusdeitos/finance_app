import { useQueryClient } from '@tanstack/react-query'
import { startImpersonation, stopImpersonation } from '@/api/admin'
import { useMe } from '@/hooks/useMe'

/**
 * Impersonation state + actions. State is derived from `/api/auth/me` (the
 * backend returns an `impersonator` when the session is impersonated), so there
 * is no client-held token: the impersonation JWT lives in an HttpOnly cookie
 * swapped server-side. After start/stop we invalidate all queries so the whole
 * app reloads under the new identity.
 */
export function useImpersonation() {
  const queryClient = useQueryClient()
  const { query } = useMe((m) => m.impersonator ?? null)
  const impersonator = query.data ?? null

  const start = async (targetUserId: number, reason: string): Promise<void> => {
    await startImpersonation(targetUserId, reason)
    await queryClient.invalidateQueries()
  }

  const stop = async (): Promise<void> => {
    // Best-effort revoke; always reload so the admin returns to their own view.
    try {
      await stopImpersonation()
    } finally {
      await queryClient.invalidateQueries()
    }
  }

  return { impersonator, isImpersonating: impersonator !== null, start, stop }
}
