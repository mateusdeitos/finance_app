import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchVapidPublicKey,
  fetchSubscriptionStatus,
  postSubscription,
  deleteSubscription,
} from './pushSubscriptions'

const BASE_URL = 'http://localhost:8080'

describe('pushSubscriptions API client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── fetchVapidPublicKey ────────────────────────────────────────────────────

  describe('fetchVapidPublicKey', () => {
    it('GETs /api/push-subscriptions/vapid-public-key with credentials:include', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ key: 'test-vapid-key' }),
      })

      const result = await fetchVapidPublicKey()

      expect(fetchMock).toHaveBeenCalledOnce()
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(`${BASE_URL}/api/push-subscriptions/vapid-public-key`)
      expect(init.credentials).toBe('include')
      expect(result).toEqual({ key: 'test-vapid-key' })
    })

    it('throws the response object on non-ok status', async () => {
      const errorResponse = { ok: false, status: 401 }
      fetchMock.mockResolvedValueOnce(errorResponse)

      await expect(fetchVapidPublicKey()).rejects.toBe(errorResponse)
    })
  })

  // ── fetchSubscriptionStatus ────────────────────────────────────────────────

  describe('fetchSubscriptionStatus', () => {
    it('GETs /api/push-subscriptions with url-encoded endpoint query param', async () => {
      const endpoint = 'https://push.example.com/sub/abc123?x=1&y=2'
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscribed: true }),
      })

      const result = await fetchSubscriptionStatus(endpoint)

      expect(fetchMock).toHaveBeenCalledOnce()
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]

      // Verify endpoint is URL-encoded exactly once via URLSearchParams
      const expectedParams = new URLSearchParams({ endpoint })
      expect(url).toBe(`${BASE_URL}/api/push-subscriptions?${expectedParams.toString()}`)
      expect(init.credentials).toBe('include')
      expect(result).toEqual({ subscribed: true })
    })

    it('handles subscribed:false response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscribed: false }),
      })

      const result = await fetchSubscriptionStatus('https://push.example.com/sub')
      expect(result).toEqual({ subscribed: false })
    })

    it('reads `subscribed` field (not `active`)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscribed: true, active: false }),
      })

      const result = await fetchSubscriptionStatus('https://push.example.com/sub')
      expect(result.subscribed).toBe(true)
    })

    it('throws on non-ok status', async () => {
      const errorResponse = { ok: false, status: 500 }
      fetchMock.mockResolvedValueOnce(errorResponse)

      await expect(
        fetchSubscriptionStatus('https://push.example.com/sub'),
      ).rejects.toBe(errorResponse)
    })

    it('does NOT double-encode the endpoint param', async () => {
      const endpoint = 'https://push.example.com/sub/abc'
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscribed: false }),
      })

      await fetchSubscriptionStatus(endpoint)

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
      // The URL string should contain the encoded endpoint exactly once
      const parsed = new URL(url)
      // parsed.searchParams.get will decode back to the original
      expect(parsed.searchParams.get('endpoint')).toBe(endpoint)
    })
  })

  // ── postSubscription ───────────────────────────────────────────────────────

  describe('postSubscription', () => {
    const fakeSub: PushSubscriptionJSON = {
      endpoint: 'https://push.example.com/sub/abc123',
      expirationTime: null,
      keys: {
        p256dh: 'fake-p256dh-key',
        auth: 'fake-auth-key',
      },
    }

    it('POSTs to /api/push-subscriptions with correct body and headers', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true })

      await postSubscription(fakeSub)

      expect(fetchMock).toHaveBeenCalledOnce()
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(`${BASE_URL}/api/push-subscriptions`)
      expect(init.method).toBe('POST')
      expect(init.credentials).toBe('include')
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')

      const body = JSON.parse(init.body as string)
      expect(body).toEqual({
        endpoint: 'https://push.example.com/sub/abc123',
        keys: {
          p256dh: 'fake-p256dh-key',
          auth: 'fake-auth-key',
        },
      })
    })

    it('throws on non-ok status', async () => {
      const errorResponse = { ok: false, status: 422 }
      fetchMock.mockResolvedValueOnce(errorResponse)

      await expect(postSubscription(fakeSub)).rejects.toBe(errorResponse)
    })
  })

  // ── deleteSubscription ─────────────────────────────────────────────────────

  describe('deleteSubscription', () => {
    it('DELETEs /api/push-subscriptions with url-encoded endpoint param', async () => {
      const endpoint = 'https://push.example.com/sub/abc123'
      fetchMock.mockResolvedValueOnce({ ok: true })

      await deleteSubscription(endpoint)

      expect(fetchMock).toHaveBeenCalledOnce()
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const expectedParams = new URLSearchParams({ endpoint })
      expect(url).toBe(`${BASE_URL}/api/push-subscriptions?${expectedParams.toString()}`)
      expect(init.method).toBe('DELETE')
      expect(init.credentials).toBe('include')
    })

    it('throws on non-ok status', async () => {
      const errorResponse = { ok: false, status: 404 }
      fetchMock.mockResolvedValueOnce(errorResponse)

      await expect(
        deleteSubscription('https://push.example.com/sub'),
      ).rejects.toBe(errorResponse)
    })
  })
})
