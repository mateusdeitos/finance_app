import { Transactions } from '@/types/transactions'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export async function fetchTags(): Promise<Transactions.Tag[]> {
  const res = await fetch(`${apiUrl}/api/tags`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch tags')
  return res.json()
}
