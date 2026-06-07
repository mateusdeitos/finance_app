const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export namespace UserConnections {
  export type InviteInfo = {
    id: number
    name: string
    email: string
  }

  export type Connection = {
    id: number
    from_user_id: number
    from_account_id: number
    from_default_split_percentage: number
    to_user_id: number
    to_account_id: number
    to_default_split_percentage: number
    connection_status: 'pending' | 'accepted' | 'rejected'
    created_at: string
    updated_at: string
    from_linked_transaction_day_of_month?: number | null
    to_linked_transaction_day_of_month?: number | null
  }
}

export async function fetchInviteInfo(externalId: string): Promise<UserConnections.InviteInfo> {
  const res = await fetch(`${apiUrl}/api/user-connections/invite-info/${externalId}`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('User not found')
  return res.json()
}

export async function fetchUserConnections(): Promise<UserConnections.Connection[]> {
  const res = await fetch(`${apiUrl}/api/user-connections`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch user connections')
  return res.json()
}

export interface UpdateConnectionPayload {
  account_name: string
  default_split_percentage: number
  /** Day of month (1–31) for the caller's linked transactions; null clears the preference. */
  linked_transaction_day_of_month: number | null
}

export async function updateConnection(
  id: number,
  payload: UpdateConnectionPayload,
): Promise<void> {
  const res = await fetch(`${apiUrl}/api/user-connections/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? 'Failed to update connection')
  }
}

export type AcceptInviteResult = {
  alreadyConnected: boolean
  connection: UserConnections.Connection
}

export async function acceptInvite(
  externalId: string,
  splitPercentage = 50,
): Promise<AcceptInviteResult> {
  const res = await fetch(`${apiUrl}/api/user-connections/accept-invite`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      external_id: externalId,
      from_default_split_percentage: splitPercentage,
    }),
  })
  if (res.status === 409) {
    const conn = await res.json().catch(() => ({}) as UserConnections.Connection)
    return { alreadyConnected: true, connection: conn }
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? 'Failed to accept invite')
  }
  const conn = (await res.json()) as UserConnections.Connection
  return { alreadyConnected: false, connection: conn }
}
