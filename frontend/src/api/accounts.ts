import { Transactions } from '@/types/transactions'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export async function fetchAccounts(): Promise<Transactions.Account[]> {
  const res = await fetch(`${apiUrl}/api/accounts`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch accounts')
  return res.json()
}

export interface AccountPayload {
  name: string
  description?: string
  initial_balance: number
}

export async function createAccount(payload: AccountPayload): Promise<Transactions.Account> {
  const res = await fetch(`${apiUrl}/api/accounts`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to create account')
  return res.json()
}

export async function updateAccount(id: number, payload: AccountPayload): Promise<void> {
  const res = await fetch(`${apiUrl}/api/accounts/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to update account')
}

export async function deleteAccount(id: number): Promise<void> {
  const res = await fetch(`${apiUrl}/api/accounts/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to delete account')
}
