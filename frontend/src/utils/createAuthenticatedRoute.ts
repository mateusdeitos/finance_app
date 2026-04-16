import { createFileRoute } from '@tanstack/react-router'

/**
 * Wrapper around createFileRoute that enforces the /_authenticated prefix.
 * Auth protection is handled by the parent _authenticated.tsx layout route
 * via beforeLoad + ensureQueryData for the Me query.
 *
 * Usage:
 *   export const Route = createAuthenticatedRoute('/charges')({
 *     component: ChargesPage,
 *   })
 *
 * This is equivalent to:
 *   export const Route = createFileRoute('/_authenticated/charges')({...})
 *
 * But makes the auth requirement explicit at the call site.
 */
export function createAuthenticatedRoute(path: string) {
  return createFileRoute(`/_authenticated${path}`)
}
