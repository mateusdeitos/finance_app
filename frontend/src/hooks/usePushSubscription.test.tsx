/**
 * Unit tests for usePushSubscription — 5-state machine
 *
 * Uses renderHook from @testing-library/react with a QueryClientProvider wrapper.
 * Per-test overrides of the jsdom push stubs defined in vitest.setup.ts are
 * applied via vi.fn() and property reassignment before each test.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock @mantine/notifications so we can assert toast calls without a full Mantine
// provider. Must be declared before the import that triggers the module graph.
vi.mock('@mantine/notifications', () => ({
  notifications: {
    show: vi.fn(),
  },
}))

// Mock the api client — the hook must NOT call real fetch
vi.mock('@/api/pushSubscriptions', () => ({
  fetchVapidPublicKey: vi.fn(),
  fetchSubscriptionStatus: vi.fn(),
  postSubscription: vi.fn(),
  deleteSubscription: vi.fn(),
}))

// Imports AFTER vi.mock declarations (Vitest hoists vi.mock to the top)
import { notifications } from '@mantine/notifications'
import * as pushApi from '@/api/pushSubscriptions'
import { usePushSubscription, notificationHelperText, type NotificationState } from './usePushSubscription'

// ── Helper types ──────────────────────────────────────────────────────────────

type PushManagerStub = {
  subscribe: MockInstance
  getSubscription: MockInstance
}

type ServiceWorkerReadyStub = {
  pushManager: PushManagerStub
}

// ── Test wrapper ──────────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // Don't fetch on mount in tests unless we explicitly enable them
        staleTime: Infinity,
      },
    },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { wrapper, queryClient }
}

// ── Helpers to manipulate the jsdom stubs ─────────────────────────────────────

function setNotificationPermission(permission: NotificationPermission) {
  const current = globalThis.Notification as unknown as { requestPermission: MockInstance }
  ;(globalThis as unknown as Record<string, unknown>)['Notification'] = {
    permission,
    requestPermission: current.requestPermission,
  }
}

function setRequestPermissionResult(result: NotificationPermission) {
  // Keep permission='default' initially so hook doesn't pre-derive 'denied'.
  // The mock resolves to `result` and also updates Notification.permission
  // to match browser behavior (the browser updates .permission on resolve).
  ;(globalThis as unknown as Record<string, unknown>)['Notification'] = {
    permission: 'default' as NotificationPermission,
    requestPermission: vi.fn().mockImplementation(async () => {
      // Simulate browser updating Notification.permission on resolution
      setNotificationPermission(result)
      return result
    }),
  }
}

function makePushManagerStub(subscription: PushSubscription | null = null): PushManagerStub {
  return {
    subscribe: vi.fn().mockResolvedValue(subscription),
    getSubscription: vi.fn().mockResolvedValue(subscription),
  }
}

function setServiceWorkerReady(registration: ServiceWorkerReadyStub) {
  ;(navigator as unknown as Record<string, unknown>)['serviceWorker'] = {
    ...(navigator.serviceWorker as object),
    ready: Promise.resolve(registration),
  }
}

function setPushManagerPresent(present: boolean) {
  if (present) {
    ;(window as unknown as Record<string, unknown>)['PushManager'] = class PushManagerStub {}
  } else {
    delete (window as unknown as Record<string, unknown>)['PushManager']
  }
}

function setServiceWorkerPresent(present: boolean) {
  if (!present) {
    delete (navigator as unknown as Record<string, unknown>)['serviceWorker']
  }
}

// A minimal PushSubscription-like object with .toJSON() and .unsubscribe()
function makeFakeSubscription(endpoint = 'https://push.example.com/sub/abc123'): PushSubscription {
  return {
    endpoint,
    expirationTime: null,
    options: { userVisibleOnly: true, applicationServerKey: null },
    getKey: vi.fn().mockReturnValue(null),
    toJSON: vi.fn().mockReturnValue({
      endpoint,
      expirationTime: null,
      keys: { p256dh: 'fake-p256dh', auth: 'fake-auth' },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as PushSubscription
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  // Ensure default jsdom state for each test
  setNotificationPermission('default')
  setPushManagerPresent(true)

  // Default api mock responses
  vi.mocked(pushApi.fetchVapidPublicKey).mockResolvedValue({ key: 'test-vapid-key' })
  vi.mocked(pushApi.fetchSubscriptionStatus).mockResolvedValue({ subscribed: false })
  vi.mocked(pushApi.postSubscription).mockResolvedValue(undefined)
  vi.mocked(pushApi.deleteSubscription).mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  // Restore PushManager and serviceWorker to their initial state
  setPushManagerPresent(true)
  setServiceWorkerReady({ pushManager: makePushManagerStub() })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('usePushSubscription', () => {
  // ── State: unsupported ─────────────────────────────────────────────────────

  describe('state: unsupported', () => {
    it('returns unsupported when PushManager is absent', () => {
      setPushManagerPresent(false)
      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => usePushSubscription(), { wrapper })
      expect(result.current.state).toBe('unsupported')
    })

    it('returns unsupported when serviceWorker is absent', () => {
      setServiceWorkerPresent(false)
      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => usePushSubscription(), { wrapper })
      expect(result.current.state).toBe('unsupported')
    })

    it('onToggle is a noop in unsupported state', async () => {
      setPushManagerPresent(false)
      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => usePushSubscription(), { wrapper })
      await act(async () => {
        await result.current.onToggle()
      })
      expect(pushApi.fetchVapidPublicKey).not.toHaveBeenCalled()
      expect(Notification.requestPermission).not.toHaveBeenCalled()
    })
  })

  // ── State: denied ─────────────────────────────────────────────────────────

  describe('state: denied', () => {
    it('returns denied when Notification.permission is "denied"', () => {
      setNotificationPermission('denied')
      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => usePushSubscription(), { wrapper })
      expect(result.current.state).toBe('denied')
    })

    it('onToggle is a noop in denied state', async () => {
      setNotificationPermission('denied')
      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => usePushSubscription(), { wrapper })
      await act(async () => {
        await result.current.onToggle()
      })
      expect(pushApi.fetchVapidPublicKey).not.toHaveBeenCalled()
    })
  })

  // ── State: default ─────────────────────────────────────────────────────────

  describe('state: default', () => {
    it('returns default when permission is "default" and backend returns subscribed:false', async () => {
      setNotificationPermission('default')
      const { wrapper, queryClient } = makeWrapper()
      // Pre-seed the query so the hook resolves to subscribed:false without a fetch
      queryClient.setQueryData(['push-subscription'], { subscribed: false })
      const { result } = renderHook(() => usePushSubscription(), { wrapper })
      await waitFor(() => expect(result.current.state).toBe('default'))
    })
  })

  // ── State: enabled ─────────────────────────────────────────────────────────

  describe('state: enabled', () => {
    it('returns enabled when backend returns subscribed:true', async () => {
      setNotificationPermission('default')
      const { wrapper, queryClient } = makeWrapper()
      queryClient.setQueryData(['push-subscription'], { subscribed: true })
      const { result } = renderHook(() => usePushSubscription(), { wrapper })
      await waitFor(() => expect(result.current.state).toBe('enabled'))
    })
  })

  // ── CTRL-01: requestPermission NEVER called on mount ─────────────────────

  describe('CTRL-01: no requestPermission on mount', () => {
    it('does NOT call Notification.requestPermission on initial render', () => {
      const { wrapper } = makeWrapper()
      renderHook(() => usePushSubscription(), { wrapper })
      // requestPermission must not have been called without an explicit toggle
      expect(Notification.requestPermission).not.toHaveBeenCalled()
    })

    it('does NOT call Notification.requestPermission in any effect after mount', async () => {
      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => usePushSubscription(), { wrapper })
      // Wait for query resolution
      await waitFor(() => expect(result.current.state).not.toBe('requesting'))
      expect(Notification.requestPermission).not.toHaveBeenCalled()
    })

    it('calls Notification.requestPermission exactly once after an explicit toggle from default', async () => {
      setNotificationPermission('default')
      setRequestPermissionResult('granted')
      const fakeSub = makeFakeSubscription()
      const pm = makePushManagerStub(fakeSub)
      setServiceWorkerReady({ pushManager: pm })

      const { wrapper, queryClient } = makeWrapper()
      queryClient.setQueryData(['push-subscription'], { subscribed: false })

      const { result } = renderHook(() => usePushSubscription(), { wrapper })
      await waitFor(() => expect(result.current.state).toBe('default'))

      // BEFORE toggle — no prompt
      expect(Notification.requestPermission).not.toHaveBeenCalled()

      await act(async () => {
        await result.current.onToggle()
      })

      // AFTER toggle — exactly once
      expect(Notification.requestPermission).toHaveBeenCalledTimes(1)
    })
  })

  // ── onToggle: default → subscribe success ──────────────────────────────────

  describe('onToggle: default → subscribe success', () => {
    it('calls subscribe + postSubscription and transitions to enabled with success toast', async () => {
      setNotificationPermission('default')
      setRequestPermissionResult('granted')
      const fakeSub = makeFakeSubscription()
      const pm = makePushManagerStub(fakeSub)
      setServiceWorkerReady({ pushManager: pm })

      const { wrapper, queryClient } = makeWrapper()
      queryClient.setQueryData(['push-subscription'], { subscribed: false })

      const { result } = renderHook(() => usePushSubscription(), { wrapper })
      await waitFor(() => expect(result.current.state).toBe('default'))

      await act(async () => {
        await result.current.onToggle()
      })

      expect(pm.subscribe).toHaveBeenCalledTimes(1)
      expect(pm.subscribe).toHaveBeenCalledWith({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array),
      })
      expect(pushApi.postSubscription).toHaveBeenCalledTimes(1)
      expect(pushApi.postSubscription).toHaveBeenCalledWith(fakeSub.toJSON())
      expect(result.current.state).toBe('enabled')
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'teal',
          title: 'Notificações ativadas',
        }),
      )
    })
  })

  // ── onToggle: default → permission denied → denied state, no toast ─────────

  describe('onToggle: default → permission denied', () => {
    it('transitions to denied state with NO toast when user denies the prompt', async () => {
      setNotificationPermission('default')
      setRequestPermissionResult('denied')

      const { wrapper, queryClient } = makeWrapper()
      queryClient.setQueryData(['push-subscription'], { subscribed: false })

      const { result } = renderHook(() => usePushSubscription(), { wrapper })
      await waitFor(() => expect(result.current.state).toBe('default'))

      await act(async () => {
        await result.current.onToggle()
      })

      // No toast shown
      expect(notifications.show).not.toHaveBeenCalled()
      // No subscribe/postSubscription called
      expect(pushApi.postSubscription).not.toHaveBeenCalled()
    })
  })

  // ── onToggle: default → subscribe error → stays default with error toast ───

  describe('onToggle: default → subscribe error', () => {
    it('shows error toast and stays default when postSubscription throws', async () => {
      setNotificationPermission('default')
      setRequestPermissionResult('granted')
      const fakeSub = makeFakeSubscription()
      const pm = makePushManagerStub(fakeSub)
      setServiceWorkerReady({ pushManager: pm })
      vi.mocked(pushApi.postSubscription).mockRejectedValueOnce(new Error('API error'))

      const { wrapper, queryClient } = makeWrapper()
      queryClient.setQueryData(['push-subscription'], { subscribed: false })

      const { result } = renderHook(() => usePushSubscription(), { wrapper })
      await waitFor(() => expect(result.current.state).toBe('default'))

      await act(async () => {
        await result.current.onToggle()
      })

      expect(result.current.state).toBe('default')
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'red',
          title: 'Erro ao ativar',
        }),
      )
    })
  })

  // ── onToggle: enabled → unsubscribe success ────────────────────────────────

  describe('onToggle: enabled → unsubscribe success', () => {
    it('calls deleteSubscription + unsubscribe and transitions to default with success toast', async () => {
      setNotificationPermission('default')
      const endpoint = 'https://push.example.com/sub/abc123'
      const fakeSub = makeFakeSubscription(endpoint)
      const pm = makePushManagerStub(fakeSub)
      setServiceWorkerReady({ pushManager: pm })

      const { wrapper, queryClient } = makeWrapper()
      // Seed as enabled
      queryClient.setQueryData(['push-subscription'], { subscribed: true })

      const { result } = renderHook(() => usePushSubscription(), { wrapper })
      await waitFor(() => expect(result.current.state).toBe('enabled'))

      await act(async () => {
        await result.current.onToggle()
      })

      expect(pushApi.deleteSubscription).toHaveBeenCalledWith(endpoint)
      expect(fakeSub.unsubscribe).toHaveBeenCalledTimes(1)
      expect(result.current.state).toBe('default')
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'teal',
          title: 'Notificações desativadas',
        }),
      )
    })
  })

  // ── onToggle: enabled → unsubscribe error → stays enabled ─────────────────

  describe('onToggle: enabled → unsubscribe error', () => {
    it('stays enabled and shows error toast when deleteSubscription throws', async () => {
      setNotificationPermission('default')
      const fakeSub = makeFakeSubscription()
      const pm = makePushManagerStub(fakeSub)
      setServiceWorkerReady({ pushManager: pm })
      vi.mocked(pushApi.deleteSubscription).mockRejectedValueOnce(new Error('Network error'))

      const { wrapper, queryClient } = makeWrapper()
      queryClient.setQueryData(['push-subscription'], { subscribed: true })

      const { result } = renderHook(() => usePushSubscription(), { wrapper })
      await waitFor(() => expect(result.current.state).toBe('enabled'))

      await act(async () => {
        await result.current.onToggle()
      })

      expect(result.current.state).toBe('enabled')
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          color: 'red',
          title: 'Erro ao desativar',
        }),
      )
    })
  })

  // ── helperText function ────────────────────────────────────────────────────

  describe('helperText', () => {
    it('returns short copy for mobile surface', async () => {
      const { wrapper, queryClient } = makeWrapper()
      queryClient.setQueryData(['push-subscription'], { subscribed: false })
      const { result } = renderHook(() => usePushSubscription(), { wrapper })
      await waitFor(() => expect(result.current.state).toBe('default'))

      expect(result.current.helperText('mobile')).toBe('Toque para ativar')
      expect(result.current.helperText('desktop')).toBe('Toque para ativar')
    })

    it('returns different short vs full copy for enabled state', async () => {
      const { wrapper, queryClient } = makeWrapper()
      queryClient.setQueryData(['push-subscription'], { subscribed: true })
      const { result } = renderHook(() => usePushSubscription(), { wrapper })
      await waitFor(() => expect(result.current.state).toBe('enabled'))

      expect(result.current.helperText('mobile')).toBe('Ativadas')
      expect(result.current.helperText('desktop')).toBe('Ativadas neste dispositivo')
    })

    it('returns correct copy for denied state', () => {
      setNotificationPermission('denied')
      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => usePushSubscription(), { wrapper })
      expect(result.current.state).toBe('denied')
      expect(result.current.helperText('mobile')).toBe('Bloqueadas pelo navegador')
      expect(result.current.helperText('desktop')).toBe(
        'Bloqueadas — ative nas configurações do navegador',
      )
    })

    it('returns correct copy for unsupported state', () => {
      setPushManagerPresent(false)
      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => usePushSubscription(), { wrapper })
      expect(result.current.state).toBe('unsupported')
      expect(result.current.helperText('mobile')).toBe('Não suportado')
      expect(result.current.helperText('desktop')).toBe('Não suportado neste navegador')
    })
  })
})

// ── notificationHelperText standalone tests ────────────────────────────────

describe('notificationHelperText', () => {
  const cases: Array<[NotificationState, 'mobile' | 'desktop', string]> = [
    ['default', 'mobile', 'Toque para ativar'],
    ['default', 'desktop', 'Toque para ativar'],
    ['requesting', 'mobile', 'Aguardando...'],
    ['requesting', 'desktop', 'Aguardando permissão...'],
    ['enabled', 'mobile', 'Ativadas'],
    ['enabled', 'desktop', 'Ativadas neste dispositivo'],
    ['denied', 'mobile', 'Bloqueadas pelo navegador'],
    ['denied', 'desktop', 'Bloqueadas — ative nas configurações do navegador'],
    ['unsupported', 'mobile', 'Não suportado'],
    ['unsupported', 'desktop', 'Não suportado neste navegador'],
  ]

  cases.forEach(([state, surface, expected]) => {
    it(`[${state}][${surface}] → "${expected}"`, () => {
      expect(notificationHelperText(state, surface)).toBe(expected)
    })
  })
})
