import { Notifications } from '@/types/notifications'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export async function fetchNotifications({
  cursor,
  limit,
}: {
  cursor: string
  limit: number
}): Promise<Notifications.NotificationListResponse> {
  const url = new URL(`${apiUrl}/api/notifications`, window.location.origin)
  if (cursor) url.searchParams.set('cursor', cursor)
  url.searchParams.set('limit', String(limit))
  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch notifications')
  return res.json()
}

export async function fetchNotificationUnreadCount(): Promise<Notifications.UnreadCountResponse> {
  const res = await fetch(`${apiUrl}/api/notifications/unread-count`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to fetch notification unread count')
  return res.json()
}

export async function markNotificationRead(id: number): Promise<void> {
  const res = await fetch(`${apiUrl}/api/notifications/${id}/read`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to mark notification as read')
}

export async function markAllNotificationsRead(): Promise<void> {
  const res = await fetch(`${apiUrl}/api/notifications/read-all`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to mark all notifications as read')
}

export async function deleteNotification(id: number): Promise<void> {
  const res = await fetch(`${apiUrl}/api/notifications/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to delete notification')
}

export async function deleteReadNotifications(): Promise<void> {
  const res = await fetch(`${apiUrl}/api/notifications/read`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to delete read notifications')
}
