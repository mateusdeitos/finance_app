import { Me } from '@/api/auth'
import { parseApiError } from '@/utils/apiErrors'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export type AdminUser = {
  id: number
  name: string
  email: string
  avatar_url?: string
  is_admin: boolean
}

export async function searchAdminUsers(query: string): Promise<AdminUser[]> {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  const res = await fetch(`${apiUrl}/api/admin/users?${params.toString()}`, {
    credentials: 'include',
  })
  if (!res.ok) throw await parseApiError(res)
  return res.json()
}

export type StartImpersonationResult = {
  token: string
  session_id: string
  expires_at: string
  target_user: Me
}

export async function startImpersonation(
  targetUserId: number,
  reason: string,
): Promise<StartImpersonationResult> {
  const res = await fetch(`${apiUrl}/api/admin/impersonation`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_user_id: targetUserId, reason }),
  })
  if (!res.ok) throw await parseApiError(res)
  return res.json()
}

// stopImpersonation is called while the impersonation token is active; the fetch
// interceptor attaches it, so the backend can revoke the current session.
export async function stopImpersonation(): Promise<void> {
  const res = await fetch(`${apiUrl}/api/impersonation/stop`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw await parseApiError(res)
}
