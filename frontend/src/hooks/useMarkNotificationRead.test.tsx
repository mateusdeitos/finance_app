/**
 * Unit tests for useMarkNotificationRead
 *
 * Uses renderHook + QueryClient harness (precedent: usePushSubscription.test.tsx).
 * The mutationFn (markNotificationRead) is mocked so no real fetch is made.
 *
 * Key invariants:
 * - onMutate flips the target notification to read=true in the inbox cache
 * - onMutate decrements unread count ONLY when row was previously unread (floor 0)
 * - onError rolls back BOTH caches to their pre-mutation snapshots
 * - onSettled invalidates NotificationUnreadCount (reconciles badge with server)
 * - onSuccess delegates to the caller-supplied callback (inbox-list invalidation)
 * - Marking an already-read row does NOT decrement the count
 * - Count never goes below 0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, InfiniteData } from '@tanstack/react-query'
import React from 'react'
import { Notifications } from '@/types/notifications'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/api/notifications', () => ({
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  fetchNotifications: vi.fn(),
  fetchNotificationUnreadCount: vi.fn(),
}))

import * as notificationsApi from '@/api/notifications'
import { useMarkNotificationRead } from './useMarkNotificationRead'
import { QueryKeys } from '@/utils/queryKeys'

// ── Helpers ───────────────────────────────────────────────────────────────────

type InboxCache = InfiniteData<Notifications.NotificationListResponse, unknown>

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function makeNotification(
  id: number,
  read = false,
): Notifications.Notification {
  return {
    id,
    type: 'charge_received',
    entity_type: 'charge',
    entity_id: id * 10,
    read,
    created_at: '2026-05-30T00:00:00Z',
  }
}

function seedInboxCache(
  queryClient: QueryClient,
  notifications: Notifications.Notification[],
): void {
  const inboxData: InboxCache = {
    pages: [
      {
        notifications,
        next_cursor: '',
        has_more: false,
      },
    ],
    pageParams: [''],
  }
  queryClient.setQueryData<InboxCache>([QueryKeys.Notifications], inboxData)
}

function seedUnreadCount(queryClient: QueryClient, count: number): void {
  queryClient.setQueryData<Notifications.UnreadCountResponse>(
    [QueryKeys.NotificationUnreadCount],
    { count },
  )
}

function getInboxNotification(
  queryClient: QueryClient,
  id: number,
): Notifications.Notification | undefined {
  const data = queryClient.getQueryData<InboxCache>([QueryKeys.Notifications])
  return data?.pages.flatMap((p) => p.notifications).find((n) => n.id === id)
}

function getUnreadCount(queryClient: QueryClient): number | undefined {
  const data = queryClient.getQueryData<Notifications.UnreadCountResponse>([
    QueryKeys.NotificationUnreadCount,
  ])
  return data?.count
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useMarkNotificationRead', () => {
  describe('onMutate: optimistic cache update', () => {
    it('flips the target notification to read=true in inbox cache', async () => {
      const queryClient = makeQueryClient()
      seedInboxCache(queryClient, [makeNotification(1, false)])
      seedUnreadCount(queryClient, 3)

      vi.mocked(notificationsApi.markNotificationRead).mockResolvedValue(undefined)

      const { result } = renderHook(() => useMarkNotificationRead(), {
        wrapper: makeWrapper(queryClient),
      })

      await act(async () => {
        result.current.mutation.mutate(1)
      })

      // Immediately after mutate (before the promise resolves) — but since
      // we're awaiting the act, onMutate has already fired.
      await waitFor(() => {
        expect(result.current.mutation.isSuccess).toBe(true)
      })

      expect(getInboxNotification(queryClient, 1)?.read).toBe(true)
    })

    it('decrements unread count when row was previously unread', async () => {
      const queryClient = makeQueryClient()
      seedInboxCache(queryClient, [makeNotification(1, false)])
      seedUnreadCount(queryClient, 3)

      vi.mocked(notificationsApi.markNotificationRead).mockResolvedValue(undefined)

      const { result } = renderHook(() => useMarkNotificationRead(), {
        wrapper: makeWrapper(queryClient),
      })

      // Capture count just after onMutate fires (before settle)
      // We pause the mutation so we can observe the optimistic state
      let resolveMutation!: () => void
      vi.mocked(notificationsApi.markNotificationRead).mockReturnValue(
        new Promise<void>((resolve) => { resolveMutation = resolve }),
      )

      act(() => {
        result.current.mutation.mutate(1)
      })

      // Wait for onMutate to have fired (isPending transitions)
      await waitFor(() => expect(result.current.mutation.isPending).toBe(true))

      // Optimistic state: count decremented
      expect(getUnreadCount(queryClient)).toBe(2)

      // Resolve the mutation
      await act(async () => { resolveMutation() })
    })

    it('does NOT decrement count when row was already read', async () => {
      const queryClient = makeQueryClient()
      seedInboxCache(queryClient, [makeNotification(1, true)]) // already read
      seedUnreadCount(queryClient, 3)

      let resolveMutation!: () => void
      vi.mocked(notificationsApi.markNotificationRead).mockReturnValue(
        new Promise<void>((resolve) => { resolveMutation = resolve }),
      )

      const { result } = renderHook(() => useMarkNotificationRead(), {
        wrapper: makeWrapper(queryClient),
      })

      act(() => {
        result.current.mutation.mutate(1)
      })

      await waitFor(() => expect(result.current.mutation.isPending).toBe(true))

      // Count should NOT have changed
      expect(getUnreadCount(queryClient)).toBe(3)

      await act(async () => { resolveMutation() })
    })

    it('never decrements count below 0 (Math.max guard)', async () => {
      const queryClient = makeQueryClient()
      seedInboxCache(queryClient, [makeNotification(1, false)])
      seedUnreadCount(queryClient, 0) // already at 0

      let resolveMutation!: () => void
      vi.mocked(notificationsApi.markNotificationRead).mockReturnValue(
        new Promise<void>((resolve) => { resolveMutation = resolve }),
      )

      const { result } = renderHook(() => useMarkNotificationRead(), {
        wrapper: makeWrapper(queryClient),
      })

      act(() => {
        result.current.mutation.mutate(1)
      })

      await waitFor(() => expect(result.current.mutation.isPending).toBe(true))

      // Should floor at 0
      expect(getUnreadCount(queryClient)).toBe(0)

      await act(async () => { resolveMutation() })
    })
  })

  describe('onError: rollback', () => {
    it('restores both caches to pre-mutation state on error', async () => {
      const queryClient = makeQueryClient()
      const unreadNotif = makeNotification(1, false)
      seedInboxCache(queryClient, [unreadNotif])
      seedUnreadCount(queryClient, 3)

      vi.mocked(notificationsApi.markNotificationRead).mockRejectedValue(
        new Error('Network error'),
      )

      const { result } = renderHook(() => useMarkNotificationRead(), {
        wrapper: makeWrapper(queryClient),
      })

      await act(async () => {
        result.current.mutation.mutate(1)
      })

      await waitFor(() => expect(result.current.mutation.isError).toBe(true))

      // Both caches should be rolled back
      expect(getInboxNotification(queryClient, 1)?.read).toBe(false)
      expect(getUnreadCount(queryClient)).toBe(3)
    })
  })

  describe('onSettled: unread-count invalidation', () => {
    it('invalidates NotificationUnreadCount after success', async () => {
      const queryClient = makeQueryClient()
      seedInboxCache(queryClient, [makeNotification(1, false)])
      seedUnreadCount(queryClient, 3)

      vi.mocked(notificationsApi.markNotificationRead).mockResolvedValue(undefined)

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useMarkNotificationRead(), {
        wrapper: makeWrapper(queryClient),
      })

      await act(async () => {
        result.current.mutation.mutate(1)
      })

      await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true))

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: [QueryKeys.NotificationUnreadCount] }),
      )
    })

    it('invalidates NotificationUnreadCount even after error', async () => {
      const queryClient = makeQueryClient()
      seedInboxCache(queryClient, [makeNotification(1, false)])
      seedUnreadCount(queryClient, 3)

      vi.mocked(notificationsApi.markNotificationRead).mockRejectedValue(
        new Error('fail'),
      )

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useMarkNotificationRead(), {
        wrapper: makeWrapper(queryClient),
      })

      await act(async () => {
        result.current.mutation.mutate(1)
      })

      await waitFor(() => expect(result.current.mutation.isError).toBe(true))

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: [QueryKeys.NotificationUnreadCount] }),
      )
    })
  })

  describe('onSuccess: caller callback', () => {
    it('calls options.onSuccess when mutation succeeds', async () => {
      const queryClient = makeQueryClient()
      seedInboxCache(queryClient, [makeNotification(1, false)])
      seedUnreadCount(queryClient, 3)

      vi.mocked(notificationsApi.markNotificationRead).mockResolvedValue(undefined)

      const onSuccess = vi.fn()
      const { result } = renderHook(() => useMarkNotificationRead({ onSuccess }), {
        wrapper: makeWrapper(queryClient),
      })

      await act(async () => {
        result.current.mutation.mutate(1)
      })

      await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true))

      expect(onSuccess).toHaveBeenCalledTimes(1)
    })

    it('does NOT call options.onSuccess on error', async () => {
      const queryClient = makeQueryClient()
      seedInboxCache(queryClient, [makeNotification(1, false)])
      seedUnreadCount(queryClient, 3)

      vi.mocked(notificationsApi.markNotificationRead).mockRejectedValue(
        new Error('fail'),
      )

      const onSuccess = vi.fn()
      const { result } = renderHook(() => useMarkNotificationRead({ onSuccess }), {
        wrapper: makeWrapper(queryClient),
      })

      await act(async () => {
        result.current.mutation.mutate(1)
      })

      await waitFor(() => expect(result.current.mutation.isError).toBe(true))

      expect(onSuccess).not.toHaveBeenCalled()
    })
  })

  describe('returns { mutation }', () => {
    it('exposes mutation object with mutate function', () => {
      const queryClient = makeQueryClient()

      vi.mocked(notificationsApi.markNotificationRead).mockResolvedValue(undefined)

      const { result } = renderHook(() => useMarkNotificationRead(), {
        wrapper: makeWrapper(queryClient),
      })

      expect(result.current).toHaveProperty('mutation')
      expect(typeof result.current.mutation.mutate).toBe('function')
    })
  })
})
