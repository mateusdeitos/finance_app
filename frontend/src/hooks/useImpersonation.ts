import { useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { startImpersonation, stopImpersonation } from '@/api/admin'
import {
  clearImpersonation,
  getImpersonation,
  setImpersonation,
  subscribeImpersonation,
  type ImpersonationSession,
} from '@/utils/impersonation'

/**
 * Exposes the current impersonation session and start/stop actions.
 *
 * The session is held in an external store (see `utils/impersonation.ts`) and
 * read via `useSyncExternalStore`, so every subscriber re-renders when it
 * changes. After starting or stopping we invalidate *all* queries so the whole
 * app reloads its data under the new identity.
 */
export function useImpersonation() {
  const session = useSyncExternalStore(subscribeImpersonation, getImpersonation, getImpersonation)
  const queryClient = useQueryClient()

  const start = async (targetUserId: number, reason: string): Promise<void> => {
    const result = await startImpersonation(targetUserId, reason)
    const next: ImpersonationSession = {
      token: result.token,
      session_id: result.session_id,
      expires_at: result.expires_at,
      target: {
        id: result.target_user.id,
        name: result.target_user.name,
        email: result.target_user.email,
        avatar_url: result.target_user.avatar_url,
      },
    }
    setImpersonation(next)
    await queryClient.invalidateQueries()
  }

  const stop = async (): Promise<void> => {
    // Best-effort server-side revoke; always clear locally even if it fails so
    // the admin is never stuck in an impersonated state.
    try {
      await stopImpersonation()
    } finally {
      clearImpersonation()
      await queryClient.invalidateQueries()
    }
  }

  return { session, isImpersonating: session !== null, start, stop }
}
