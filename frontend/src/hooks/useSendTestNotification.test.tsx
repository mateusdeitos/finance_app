/**
 * Unit tests for useSendTestNotification
 *
 * Mirrors useDeleteNotification.test.tsx (renderHook + QueryClient harness).
 * The mutationFn (sendTestNotification) is mocked so no real fetch is made.
 *
 * Key invariants:
 * - mutate() calls the backend sendTestNotification endpoint exactly once
 * - onSuccess delegates to the caller-supplied callback
 * - onError delegates to the caller-supplied callback
 * - returns { mutation } with a mutate function
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/api/notifications', () => ({
  sendTestNotification: vi.fn(),
  deleteNotification: vi.fn(),
  deleteReadNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  fetchNotifications: vi.fn(),
  fetchNotificationUnreadCount: vi.fn(),
}))

import * as notificationsApi from '@/api/notifications'
import { useSendTestNotification } from './useSendTestNotification'

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

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useSendTestNotification', () => {
  it('calls the backend endpoint once when mutate fires', async () => {
    const queryClient = makeQueryClient()
    vi.mocked(notificationsApi.sendTestNotification).mockResolvedValue(undefined)

    const { result } = renderHook(() => useSendTestNotification(), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async () => {
      result.current.mutation.mutate()
    })

    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true))

    expect(notificationsApi.sendTestNotification).toHaveBeenCalledTimes(1)
  })

  it('calls options.onSuccess when the test push succeeds', async () => {
    const queryClient = makeQueryClient()
    vi.mocked(notificationsApi.sendTestNotification).mockResolvedValue(undefined)

    const onSuccess = vi.fn()
    const { result } = renderHook(() => useSendTestNotification({ onSuccess }), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async () => {
      result.current.mutation.mutate()
    })

    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true))

    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('calls options.onError when the test push fails', async () => {
    const queryClient = makeQueryClient()
    vi.mocked(notificationsApi.sendTestNotification).mockRejectedValue(new Error('fail'))

    const onError = vi.fn()
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useSendTestNotification({ onSuccess, onError }), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async () => {
      result.current.mutation.mutate()
    })

    await waitFor(() => expect(result.current.mutation.isError).toBe(true))

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('exposes mutation object with mutate function', () => {
    const queryClient = makeQueryClient()
    vi.mocked(notificationsApi.sendTestNotification).mockResolvedValue(undefined)

    const { result } = renderHook(() => useSendTestNotification(), {
      wrapper: makeWrapper(queryClient),
    })

    expect(result.current).toHaveProperty('mutation')
    expect(typeof result.current.mutation.mutate).toBe('function')
  })
})
