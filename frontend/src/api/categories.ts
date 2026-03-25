import { Transactions } from '@/types/transactions'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export async function fetchCategories(): Promise<Transactions.Category[]> {
  const res = await fetch(`${apiUrl}/api/categories`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch categories')
  return res.json()
}

export async function createCategory(payload: {
  name: string
  emoji?: string
  parent_id?: number
}): Promise<Transactions.Category> {
  const res = await fetch(`${apiUrl}/api/categories`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message ?? 'Failed to create category')
  }
  return res.json()
}

export async function updateCategory(
  id: number,
  payload: { name: string; emoji?: string; parent_id?: number },
): Promise<void> {
  const res = await fetch(`${apiUrl}/api/categories/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message ?? 'Failed to update category')
  }
}

export async function deleteCategory(id: number, replaceWithId?: number): Promise<void> {
  const body = replaceWithId != null ? { replace_with_id: replaceWithId } : undefined
  const res = await fetch(`${apiUrl}/api/categories/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message ?? 'Failed to delete category')
  }
}
