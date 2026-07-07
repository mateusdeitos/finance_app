const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export type Impersonator = {
  admin_user_id: number
  admin_email: string
}

export type Me = {
  id: number
  external_id: string
  name: string
  email: string
  avatar_url?: string
  is_admin: boolean
  // Present only while an admin is impersonating this (target) user.
  impersonator?: Impersonator | null
}

export async function fetchMe(): Promise<Me> {
  const res = await fetch(`${apiUrl}/api/auth/me`, { credentials: 'include' })
  if (!res.ok) throw new Error('Unauthorized')
  return res.json()
}

export async function logout(): Promise<void> {
  const res = await fetch(`${apiUrl}/auth/logout`, { method: 'POST', credentials: 'include' })
  if (!res.ok) throw new Error('Logout failed')
}
