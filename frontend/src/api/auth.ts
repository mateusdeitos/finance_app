const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export type Me = {
  id: number
  name: string
  email: string
}

export async function fetchMe(): Promise<Me> {
  const res = await fetch(`${apiUrl}/api/auth/me`, { credentials: 'include' })
  if (!res.ok) throw new Error('Unauthorized')
  return res.json()
}
