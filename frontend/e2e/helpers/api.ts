/**
 * Lightweight API helpers for test setup/teardown.
 * These make direct HTTP calls using the auth cookie from the storage state.
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import type { Transactions } from '../../src/types/transactions'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://localhost:8080'
const STORAGE_STATE_PATH = path.join(__dirname, '..', '.auth', 'storageState.json')

function getAuthToken(): string {
  if (!fs.existsSync(STORAGE_STATE_PATH)) {
    throw new Error('auth_token cookie not found in storage state. Run global setup first.')
  }
  const state = JSON.parse(fs.readFileSync(STORAGE_STATE_PATH, 'utf-8'))
  const cookie = state?.cookies?.find((c: { name: string }) => c.name === 'auth_token')
  if (!cookie) throw new Error('auth_token cookie not found in storage state. Run global setup first.')
  return cookie.value
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getAuthToken()
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${options.method ?? 'GET'} ${path} failed: ${res.status} ${text}`)
  }
  return res
}

export interface AccountPayload {
  name: string
  description?: string
  initial_balance: number
  avatar_background_color?: string
}

export async function apiCreateAccount(payload: AccountPayload): Promise<{ id: number; name: string }> {
  const res = await apiFetch('/api/accounts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return res.json()
}

export async function apiDeleteAccount(id: number): Promise<void> {
  await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' })
}

export async function apiCreateCategory(payload: { name: string; parent_id?: number }): Promise<{ id: number; name: string }> {
  const res = await apiFetch('/api/categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return res.json()
}

export async function apiDeleteCategory(id: number, replaceWithId?: number): Promise<void> {
  await apiFetch(`/api/categories/${id}`, {
    method: 'DELETE',
    body: replaceWithId ? JSON.stringify({ replace_with_id: replaceWithId }) : undefined,
  })
}

function localMidnightISO(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day, 0, 0, 0)
  const offsetMin = -d.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const absMin = Math.abs(offsetMin)
  const hh = String(Math.floor(absMin / 60)).padStart(2, '0')
  const mm = String(absMin % 60).padStart(2, '0')
  return `${dateStr}T00:00:00${sign}${hh}:${mm}`
}

export async function apiCreateTransaction(payload: Transactions.CreateTransactionPayload): Promise<{ id: number }> {
  const body = {
    ...payload,
    date: payload.date.length === 10 ? localMidnightISO(payload.date) : payload.date,
  }
  const res = await apiFetch('/api/transactions', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function apiDeleteTransaction(
  id: number,
  propagation?: 'current' | 'current_and_future' | 'all',
): Promise<void> {
  const url = propagation
    ? `/api/transactions/${id}?propagation_settings=${propagation}`
    : `/api/transactions/${id}`
  await apiFetch(url, { method: 'DELETE' })
}

export async function apiCreateTag(payload: { name: string }): Promise<{ id: number; name: string }> {
  const res = await apiFetch('/api/tags', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return res.json()
}

export async function apiDeleteTag(id: number): Promise<void> {
  await apiFetch(`/api/tags/${id}`, { method: 'DELETE' })
}

// --- User Connections ---

export async function apiCreateUserConnection(toUserId: number, splitPercentage = 50): Promise<{ id: number }> {
  const res = await apiFetch('/api/user-connections', {
    method: 'POST',
    body: JSON.stringify({
      to_user_id: toUserId,
      from_default_split_percentage: splitPercentage,
    }),
  })
  return res.json()
}

export async function apiAcceptConnection(connectionId: number): Promise<void> {
  await apiFetch(`/api/user-connections/${connectionId}/accepted`, {
    method: 'PATCH',
  })
}

// --- Charges ---

export interface ChargePayload {
  connection_id: number
  my_account_id: number
  period_month: number
  period_year: number
  description?: string
  amount?: number
  date: string
}

export async function apiCreateCharge(payload: ChargePayload): Promise<{ id: number; amount?: number; charger_user_id: number; payer_user_id: number }> {
  const res = await apiFetch('/api/charges', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return res.json()
}

export async function apiCancelCharge(id: number): Promise<void> {
  await apiFetch(`/api/charges/${id}/cancel`, { method: 'POST' })
}

// --- Auth helpers for multi-user tests ---

/** Get auth token for a specific user email via test-login */
export async function getAuthTokenForUser(email: string): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/auth/test-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error(`Test login failed for ${email}: ${res.status}`)
  const setCookie = res.headers.get('set-cookie')
  const match = setCookie?.match(/auth_token=([^;]+)/)
  if (!match) throw new Error('No auth_token in response')
  return match[1]
}

/** Make an API call authenticated as a specific user */
export async function apiFetchAs(token: string, path: string, options: RequestInit = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${options.method ?? 'GET'} ${path} failed: ${res.status} ${text}`)
  }
  return res
}

export async function apiGetTransaction(id: number): Promise<Transactions.Transaction> {
  const res = await apiFetch(`/api/transactions/${id}`)
  const transactions = await res.json()
  // The endpoint returns an array; find the one with matching ID
  if (Array.isArray(transactions)) {
    const tx = transactions.find((t: { id: number }) => t.id === id)
    if (!tx) throw new Error(`Transaction ${id} not found in response`)
    return tx
  }
  return transactions
}

export async function apiUpdateTransaction(
  id: number,
  payload: Partial<Transactions.CreateTransactionPayload>,
): Promise<void> {
  const body = {
    ...payload,
    date: payload.date && payload.date.length === 10
      ? localMidnightISO(payload.date)
      : payload.date,
  }
  await apiFetch(`/api/transactions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}
