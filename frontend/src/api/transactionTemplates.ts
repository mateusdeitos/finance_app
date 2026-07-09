import { Transactions } from '@/types/transactions'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export async function fetchTransactionTemplates(): Promise<Transactions.Template[]> {
  const res = await fetch(`${apiUrl}/api/transaction-templates`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch transaction templates')
  return res.json()
}
