import { createFileRoute } from '@tanstack/react-router'

type RoutePath = Parameters<typeof createFileRoute>[0]

/**
 * Builds the full route path for a route nested under the `/_authenticated` layout.
 * Use this with `createFileRoute` in files under `routes/_authenticated.*.tsx`.
 *
 * @example
 * export const Route = createFileRoute(authenticatedPath('/transactions'))({ ... })
 */
export function authenticatedPath(path: string): RoutePath {
  return `/_authenticated${path}` as RoutePath
}
