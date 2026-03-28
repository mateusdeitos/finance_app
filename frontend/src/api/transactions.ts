import { Transactions } from '@/types/transactions'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

/** Converts a YYYY-MM-DD string to an RFC3339 string at local midnight, preserving the calendar date. */
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

export async function fetchBalance(
  params: Transactions.FetchBalanceParams,
): Promise<Transactions.BalanceResult> {
  const url = new URL(`${apiUrl}/api/transactions/balance`)

  url.searchParams.set('month', String(params.month))
  url.searchParams.set('year', String(params.year))
  url.searchParams.set('accumulated', String(params.accumulated))

  if (params.accountIds?.length) {
    params.accountIds.forEach((id) => url.searchParams.append('account_id[]', String(id)))
  }
  if (params.categoryIds?.length) {
    params.categoryIds.forEach((id) => url.searchParams.append('category_id[]', String(id)))
  }
  if (params.tagIds?.length) {
    params.tagIds.forEach((id) => url.searchParams.append('tag_id[]', String(id)))
  }

  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch balance')
  return res.json()
}

export async function fetchTransactions(
  params: Transactions.FetchParams,
): Promise<Transactions.Transaction[]> {
  const url = new URL(`${apiUrl}/api/transactions`)

  url.searchParams.set('month', String(params.month))
  url.searchParams.set('year', String(params.year))
  url.searchParams.set('with_settlements', 'true')

  if (params.accountIds?.length) {
    params.accountIds.forEach((id) => url.searchParams.append('account_id[]', String(id)))
  }
  if (params.categoryIds?.length) {
    params.categoryIds.forEach((id) => url.searchParams.append('category_id[]', String(id)))
  }
  if (params.tagIds?.length) {
    params.tagIds.forEach((id) => url.searchParams.append('tag_id[]', String(id)))
  }
  if (params.types?.length) {
    params.types.forEach((t) => url.searchParams.append('type[]', t))
  }
  if (params.query) {
    url.searchParams.set('description.query', params.query)
  }

  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch transactions')
  return res.json()
}

export async function fetchTransactionSuggestions(
  q: string,
  limit = 10,
): Promise<Transactions.TransactionSuggestion[]> {
  const url = new URL(`${apiUrl}/api/transactions/suggestions`)
  url.searchParams.set('q', q)
  url.searchParams.set('limit', String(limit))

  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch suggestions')
  return res.json()
}

export async function deleteTransaction(
  id: number,
  propagationSettings: 'current' | 'current_and_future' | 'all' = 'current',
): Promise<void> {
  const url = new URL(`${apiUrl}/api/transactions/${id}`)
  url.searchParams.set('propagation_settings', propagationSettings)
  const res = await fetch(url.toString(), {
    method: 'DELETE',
    credentials: 'include',
  })
  if (res.status === 404) return
  if (!res.ok) throw res
}

export async function updateTransaction(
  id: number,
  payload: Transactions.UpdateTransactionPayload,
): Promise<void> {
  const body = {
    ...payload,
    date: payload.date && payload.date.length === 10 ? localMidnightISO(payload.date) : payload.date,
  }
  const res = await fetch(`${apiUrl}/api/transactions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) throw res
}

export async function createTransaction(
  payload: Transactions.CreateTransactionPayload,
): Promise<Response> {
  const body = {
    ...payload,
    // Backend expects time.Time (RFC3339); DatePickerInput gives YYYY-MM-DD.
    // Send local midnight with timezone offset so the backend stores the correct day.
    date: payload.date.length === 10 ? localMidnightISO(payload.date) : payload.date,
  }
  const res = await fetch(`${apiUrl}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) throw res
  return res
}
