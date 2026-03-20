import { Transactions } from '@/types/transactions'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export async function fetchAccounts(): Promise<Transactions.Account[]> {
  const res = await fetch(`${apiUrl}/api/accounts`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch accounts')
  return res.json()
}
