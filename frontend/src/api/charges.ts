import { Charges } from '@/types/charges'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export async function fetchCharges(params: Charges.FetchParams): Promise<Charges.ListResponse> {
  const url = new URL(`${apiUrl}/api/charges`)
  url.searchParams.set('month', String(params.month))
  url.searchParams.set('year', String(params.year))
  if (params.direction) url.searchParams.set('direction', params.direction)
  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch charges')
  return res.json()
}

export async function fetchChargesPendingCount(): Promise<{ count: number }> {
  const res = await fetch(`${apiUrl}/api/charges/pending-count`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch pending count')
  return res.json()
}

export async function createCharge(payload: Charges.CreateChargePayload): Promise<Response> {
  const res = await fetch(`${apiUrl}/api/charges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw res
  return res
}

export async function acceptCharge(id: number, payload: Charges.AcceptChargePayload): Promise<void> {
  const res = await fetch(`${apiUrl}/api/charges/${id}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw res
}

export async function rejectCharge(id: number): Promise<void> {
  const res = await fetch(`${apiUrl}/api/charges/${id}/reject`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw res
}

export async function cancelCharge(id: number): Promise<void> {
  const res = await fetch(`${apiUrl}/api/charges/${id}/cancel`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw res
}
