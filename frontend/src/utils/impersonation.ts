/**
 * Client-side impersonation session store + fetch interceptor.
 *
 * The backend authenticates admins via an HttpOnly cookie. To impersonate a
 * user without discarding that cookie, the admin obtains a short-lived
 * impersonation JWT and we send it as `Authorization: Bearer` on API calls —
 * the backend prefers the header over the cookie, so the admin's own session
 * stays intact underneath and "stop impersonating" is just dropping the token.
 *
 * There is no central API client in this app (each function calls `fetch`
 * directly), so rather than thread the token through every call site we install
 * a single `window.fetch` wrapper that injects the header for API requests while
 * a session is active. It is a no-op for every other request.
 *
 * The token lives in sessionStorage so a refresh within the tab keeps the
 * session (and lets "stop" reach the server to revoke it); closing the tab ends
 * it. This is an admin-only, minutes-long troubleshooting token — the tradeoff
 * versus the HttpOnly cookie is deliberate and documented.
 */

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'
const STORAGE_KEY = 'impersonation_session'

export type ImpersonationTarget = {
  id: number
  name: string
  email: string
  avatar_url?: string
}

export type ImpersonationSession = {
  token: string
  session_id: string
  expires_at: string // RFC3339
  target: ImpersonationTarget
}

const listeners = new Set<() => void>()

function load(): ImpersonationSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ImpersonationSession
    if (isExpired(parsed)) {
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function isExpired(session: ImpersonationSession): boolean {
  const expiresAt = Date.parse(session.expires_at)
  return Number.isFinite(expiresAt) && expiresAt <= Date.now()
}

let current: ImpersonationSession | null = load()

function emit() {
  listeners.forEach((fn) => fn())
}

export function getImpersonation(): ImpersonationSession | null {
  if (current && isExpired(current)) {
    clearImpersonation()
  }
  return current
}

export function setImpersonation(session: ImpersonationSession): void {
  current = session
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // sessionStorage may be unavailable (private mode); the in-memory value
    // still drives the interceptor for the life of the page.
  }
  emit()
}

export function clearImpersonation(): void {
  current = null
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  emit()
}

export function subscribeImpersonation(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

let installed = false

/**
 * Wraps `window.fetch` so that, while an impersonation session is active, API
 * requests carry the impersonation Bearer token. Idempotent.
 */
export function installImpersonationInterceptor(): void {
  if (installed) return
  installed = true

  const originalFetch = window.fetch.bind(window)

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const session = getImpersonation()
    if (session && urlOf(input).startsWith(apiUrl)) {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      )
      headers.set('Authorization', `Bearer ${session.token}`)
      return originalFetch(input, { ...init, headers })
    }
    return originalFetch(input, init)
  }
}
