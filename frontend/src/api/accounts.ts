import { Transactions } from '@/types/transactions'
import { parseApiError } from '@/utils/apiErrors'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export type AccountDeletionStrategy = 'delete_transactions' | 'migrate'

export interface AccountDeletionInfo {
  transaction_count: number
}

export async function fetchAccounts(): Promise<Transactions.Account[]> {
  const res = await fetch(`${apiUrl}/api/accounts`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch accounts')
  return res.json()
}

export interface AccountPayload {
  name: string
  description?: string
  initial_balance: number
  avatar_background_color: string
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

export interface DeleteAccountOptions {
  strategy?: AccountDeletionStrategy
  targetAccountId?: number
}

export async function deleteAccount(id: number, options: DeleteAccountOptions = {}): Promise<void> {
  const params = new URLSearchParams()
  if (options.strategy) params.set('strategy', options.strategy)
  if (options.targetAccountId != null) params.set('target_account_id', String(options.targetAccountId))
  const qs = params.toString()

  const res = await fetch(`${apiUrl}/api/accounts/${id}${qs ? `?${qs}` : ''}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) {
    const { message } = await parseApiError(res)
    throw new Error(message || 'Failed to delete account')
  }
}

export async function fetchAccountDeletionInfo(id: number): Promise<AccountDeletionInfo> {
  const res = await fetch(`${apiUrl}/api/accounts/${id}/deletion-info`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch account deletion info')
  return res.json()
}

export async function deactivateAccount(id: number): Promise<void> {
  const res = await fetch(`${apiUrl}/api/accounts/${id}/deactivate`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to deactivate account')
}

export async function activateAccount(id: number): Promise<void> {
  const res = await fetch(`${apiUrl}/api/accounts/${id}/activate`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to activate account')
}

export async function reorderAccounts(accountIds: number[]): Promise<void> {
  const res = await fetch(`${apiUrl}/api/accounts/reorder`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_ids: accountIds }),
  })
  if (!res.ok) throw new Error('Failed to reorder accounts')
}
