/**
 * Lightweight API helpers for test setup/teardown.
 * These make direct HTTP calls using the auth cookie from the storage state.
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

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

export async function apiCreateTransaction(payload: {
  transaction_type: 'expense' | 'income' | 'transfer'
  account_id: number
  amount: number
  date: string
  description: string
  category_id?: number
}): Promise<{ id: number }> {
  const res = await apiFetch('/api/transactions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return res.json()
}

export async function apiDeleteTransaction(id: number): Promise<void> {
  await apiFetch(`/api/transactions/${id}`, { method: 'DELETE' })
}
