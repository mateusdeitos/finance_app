const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export interface VapidPublicKeyResponse {
  key: string
}

export interface SubscriptionStatusResponse {
  subscribed: boolean
}

export interface PushSubscriptionBody {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

export async function fetchVapidPublicKey(): Promise<VapidPublicKeyResponse> {
  const res = await fetch(`${apiUrl}/api/push-subscriptions/vapid-public-key`, {
    credentials: 'include',
  })
  if (!res.ok) throw res
  return res.json() as Promise<VapidPublicKeyResponse>
}

export async function fetchSubscriptionStatus(
  endpoint: string,
): Promise<SubscriptionStatusResponse> {
  const params = new URLSearchParams({ endpoint })
  const res = await fetch(`${apiUrl}/api/push-subscriptions?${params.toString()}`, {
    credentials: 'include',
  })
  if (!res.ok) throw res
  return res.json() as Promise<SubscriptionStatusResponse>
}

export async function postSubscription(sub: PushSubscriptionJSON): Promise<void> {
  const body: PushSubscriptionBody = {
    endpoint: sub.endpoint ?? '',
    keys: {
      p256dh: sub.keys?.p256dh ?? '',
      auth: sub.keys?.auth ?? '',
    },
  }
  const res = await fetch(`${apiUrl}/api/push-subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) throw res
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  const params = new URLSearchParams({ endpoint })
  const res = await fetch(`${apiUrl}/api/push-subscriptions?${params.toString()}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw res
}
