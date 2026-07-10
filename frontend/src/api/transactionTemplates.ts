import { Transactions } from '@/types/transactions'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export async function fetchTransactionTemplates(): Promise<Transactions.Template[]> {
  const res = await fetch(`${apiUrl}/api/transaction-templates`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch transaction templates')
  return res.json()
}

export async function createTransactionTemplate(body: {
  name: string
  payload: Transactions.TemplatePayload
}): Promise<Transactions.Template> {
  const res = await fetch(`${apiUrl}/api/transaction-templates`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message ?? 'Failed to create template')
  }
  return res.json()
}

export async function updateTransactionTemplate(
  id: number,
  body: { name: string; payload: Transactions.TemplatePayload },
): Promise<void> {
  const res = await fetch(`${apiUrl}/api/transaction-templates/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message ?? 'Failed to update template')
  }
}

export async function deleteTransactionTemplate(id: number): Promise<void> {
  const res = await fetch(`${apiUrl}/api/transaction-templates/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message ?? 'Failed to delete template')
  }
}
