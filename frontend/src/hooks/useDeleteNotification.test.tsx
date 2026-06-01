/**
 * Unit tests for useDeleteNotification
 *
 * Mirrors useMarkNotificationRead.test.tsx (renderHook + QueryClient harness).
 * The mutationFn (deleteNotification) is mocked so no real fetch is made.
 *
 * Key invariants:
 * - onMutate removes the target row from the inbox cache
 * - onMutate decrements unread count ONLY when the removed row was unread (floor 0)
 * - onError rolls back BOTH caches to their pre-mutation snapshots
 * - onSettled invalidates NotificationUnreadCount
 * - onSuccess delegates to the caller-supplied callback (inbox-list invalidation)
 * - Deleting an already-read row does NOT decrement the count
 * - Count never goes below 0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, InfiniteData } from '@tanstack/react-query'
import React from 'react'
import { Notifications } from '@/types/notifications'

vi.mock('@/api/notifications', () => ({
  deleteNotification: vi.fn(),
  deleteReadNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  fetchNotifications: vi.fn(),
  fetchNotificationUnreadCount: vi.fn(),
}))

import * as notificationsApi from '@/api/notifications'
import { useDeleteNotification } from './useDeleteNotification'
import { QueryKeys } from '@/utils/queryKeys'

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

function makeNotification(id: number, read = false): Notifications.Notification {
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
    pages: [{ notifications, next_cursor: '', has_more: false }],
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

function getInboxIds(queryClient: QueryClient): number[] {
  const data = queryClient.getQueryData<InboxCache>([QueryKeys.Notifications])
  return data?.pages.flatMap((p) => p.notifications).map((n) => n.id) ?? []
}

function getUnreadCount(queryClient: QueryClient): number | undefined {
  const data = queryClient.getQueryData<Notifications.UnreadCountResponse>([
    QueryKeys.NotificationUnreadCount,
  ])
  return data?.count
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useDeleteNotification', () => {
  describe('onMutate: optimistic removal', () => {
    it('removes the target row from the inbox cache', async () => {
      const queryClient = makeQueryClient()
      seedInboxCache(queryClient, [makeNotification(1, false), makeNotification(2, true)])
      seedUnreadCount(queryClient, 1)

      vi.mocked(notificationsApi.deleteNotification).mockResolvedValue(undefined)

      const { result } = renderHook(() => useDeleteNotification(), {
        wrapper: makeWrapper(queryClient),
      })

      await act(async () => {
        result.current.mutation.mutate(1)
      })

      await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true))

      expect(getInboxIds(queryClient)).toEqual([2])
    })

    it('decrements unread count when removed row was unread', async () => {
      const queryClient = makeQueryClient()
      seedInboxCache(queryClient, [makeNotification(1, false)])
      seedUnreadCount(queryClient, 3)

      let resolveMutation!: () => void
      vi.mocked(notificationsApi.deleteNotification).mockReturnValue(
        new Promise<void>((resolve) => {
          resolveMutation = resolve
        }),
      )

      const { result } = renderHook(() => useDeleteNotification(), {
        wrapper: makeWrapper(queryClient),
      })

      act(() => {
        result.current.mutation.mutate(1)
      })

      await waitFor(() => expect(result.current.mutation.isPending).toBe(true))
      expect(getUnreadCount(queryClient)).toBe(2)

      await act(async () => {
        resolveMutation()
      })
    })

    it('does NOT decrement count when removed row was already read', async () => {
      const queryClient = makeQueryClient()
      seedInboxCache(queryClient, [makeNotification(1, true)])
      seedUnreadCount(queryClient, 3)

      let resolveMutation!: () => void
      vi.mocked(notificationsApi.deleteNotification).mockReturnValue(
        new Promise<void>((resolve) => {
          resolveMutation = resolve
        }),
      )

      const { result } = renderHook(() => useDeleteNotification(), {
        wrapper: makeWrapper(queryClient),
      })

      act(() => {
        result.current.mutation.mutate(1)
      })

      await waitFor(() => expect(result.current.mutation.isPending).toBe(true))
      expect(getUnreadCount(queryClient)).toBe(3)

      await act(async () => {
        resolveMutation()
      })
    })

    it('never decrements count below 0', async () => {
      const queryClient = makeQueryClient()
      seedInboxCache(queryClient, [makeNotification(1, false)])
      seedUnreadCount(queryClient, 0)

      let resolveMutation!: () => void
      vi.mocked(notificationsApi.deleteNotification).mockReturnValue(
        new Promise<void>((resolve) => {
          resolveMutation = resolve
        }),
      )

      const { result } = renderHook(() => useDeleteNotification(), {
        wrapper: makeWrapper(queryClient),
      })

      act(() => {
        result.current.mutation.mutate(1)
      })

      await waitFor(() => expect(result.current.mutation.isPending).toBe(true))
      expect(getUnreadCount(queryClient)).toBe(0)

      await act(async () => {
        resolveMutation()
      })
    })
  })

  describe('onError: rollback', () => {
    it('restores both caches to pre-mutation state on error', async () => {
      const queryClient = makeQueryClient()
      seedInboxCache(queryClient, [makeNotification(1, false), makeNotification(2, true)])
      seedUnreadCount(queryClient, 1)

      vi.mocked(notificationsApi.deleteNotification).mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useDeleteNotification(), {
        wrapper: makeWrapper(queryClient),
      })

      await act(async () => {
        result.current.mutation.mutate(1)
      })

      await waitFor(() => expect(result.current.mutation.isError).toBe(true))

      expect(getInboxIds(queryClient)).toEqual([1, 2])
      expect(getUnreadCount(queryClient)).toBe(1)
    })
  })

  describe('onSettled: unread-count invalidation', () => {
    it('invalidates NotificationUnreadCount after success', async () => {
      const queryClient = makeQueryClient()
      seedInboxCache(queryClient, [makeNotification(1, false)])
      seedUnreadCount(queryClient, 3)

      vi.mocked(notificationsApi.deleteNotification).mockResolvedValue(undefined)

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useDeleteNotification(), {
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
  })

  describe('onSuccess: caller callback', () => {
    it('calls options.onSuccess when mutation succeeds', async () => {
      const queryClient = makeQueryClient()
      seedInboxCache(queryClient, [makeNotification(1, false)])
      seedUnreadCount(queryClient, 3)

      vi.mocked(notificationsApi.deleteNotification).mockResolvedValue(undefined)

      const onSuccess = vi.fn()
      const { result } = renderHook(() => useDeleteNotification({ onSuccess }), {
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

      vi.mocked(notificationsApi.deleteNotification).mockRejectedValue(new Error('fail'))

      const onSuccess = vi.fn()
      const { result } = renderHook(() => useDeleteNotification({ onSuccess }), {
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
      vi.mocked(notificationsApi.deleteNotification).mockResolvedValue(undefined)

      const { result } = renderHook(() => useDeleteNotification(), {
        wrapper: makeWrapper(queryClient),
      })

      expect(result.current).toHaveProperty('mutation')
      expect(typeof result.current.mutation.mutate).toBe('function')
    })
  })
})
