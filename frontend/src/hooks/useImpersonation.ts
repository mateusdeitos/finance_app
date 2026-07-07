import { startImpersonation, stopImpersonation } from '@/api/admin'

/**
 * Impersonation actions. Starting/stopping swaps the auth cookie server-side, so
 * it is an identity switch for the whole app. We do a hard reload afterwards
 * instead of invalidating queries: this re-fetches everything cleanly under the
 * new identity and — critically — avoids any admin-only query (e.g. the user
 * picker) refetching under the impersonated, non-admin session, which the
 * backend correctly rejects with 403.
 *
 * State (whether we're impersonating and who) is read from `/api/auth/me` via
 * `useMe().data.impersonator`; there is no client-held token.
 */
export function useImpersonation() {
  const start = async (targetUserId: number, reason: string): Promise<void> => {
    await startImpersonation(targetUserId, reason)
    window.location.reload()
  }

  const stop = async (): Promise<void> => {
    // Best-effort revoke; reload regardless so the admin returns to their own
    // view even if the request fails.
    try {
      await stopImpersonation()
    } finally {
      window.location.reload()
    }
  }

  return { start, stop }
}
