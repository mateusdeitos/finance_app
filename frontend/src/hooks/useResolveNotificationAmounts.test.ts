/**
 * Unit tests for useResolveNotificationAmounts
 *
 * Key correctness invariants:
 * - At most 1 charges request + 1 transactions request per page (no N+1)
 * - Duplicate entity_ids collapse to a single batched request
 * - amountState 'known' when found + non-null amount
 * - amountState 'missing' when id was requested but absent from response
 * - amountState 'loading' while the query is in-flight
 * - Empty id set → query disabled (no call made)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { Notifications } from '@/types/notifications'
import { Charges } from '@/types/charges'
import { Transactions } from '@/types/transactions'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/api/charges', () => ({
  fetchChargesByIds: vi.fn(),
}))

vi.mock('@/api/transactions', () => ({
  fetchTransactionsByIds: vi.fn(),
}))

import * as chargesApi from '@/api/charges'
import * as transactionsApi from '@/api/transactions'
import { useResolveNotificationAmounts } from './useResolveNotificationAmounts'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
      },
    },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { wrapper, queryClient }
}

function makeNotification(
  id: number,
  entity_type: Notifications.EntityType,
  entity_id: number,
  read = false,
): Notifications.Notification {
  return {
    id,
    type: entity_type === 'charge' ? 'charge_received' : 'split_created',
    entity_type,
    entity_id,
    read,
    created_at: '2026-05-30T00:00:00Z',
  }
}

function makeCharge(id: number, amount: number | null = 5000): Charges.Charge {
  return {
    id,
    charger_user_id: 1,
    payer_user_id: 2,
    charger_account_id: null,
    payer_account_id: null,
    connection_id: 1,
    period_month: 5,
    period_year: 2026,
    // amount is `number` in the FE type; null simulates the omitempty backend case
    amount: amount as number,
    description: null,
    status: 'pending',
    date: null,
    created_at: null,
    updated_at: null,
  }
}

function makeTransaction(id: number, amount = 10000): Transactions.Transaction {
  return {
    id,
    user_id: 1,
    type: 'expense',
    account_id: 1,
    amount,
    operation_type: 'debit',
    date: '2026-05-30T00:00:00Z',
    description: 'test',
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useResolveNotificationAmounts', () => {
  describe('≤1 requests per entity type (no N+1)', () => {
    it('fires exactly 1 charges call for a page with 2 charge notifications', async () => {
      const notifications = [
        makeNotification(1, 'charge', 10),
        makeNotification(2, 'charge', 20),
      ]
      vi.mocked(chargesApi.fetchChargesByIds).mockResolvedValue({
        charges: [makeCharge(10), makeCharge(20)],
      })
      vi.mocked(transactionsApi.fetchTransactionsByIds).mockResolvedValue([])

      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useResolveNotificationAmounts(notifications), {
        wrapper,
      })

      await waitFor(() => {
        expect(result.current.get('charge:10')?.amountState).toBe('known')
        expect(result.current.get('charge:20')?.amountState).toBe('known')
      })

      // Exactly 1 charges call — NOT 2 (no N+1)
      expect(chargesApi.fetchChargesByIds).toHaveBeenCalledTimes(1)
      expect(chargesApi.fetchChargesByIds).toHaveBeenCalledWith([10, 20])

      // No transactions call (no transaction notifications)
      expect(transactionsApi.fetchTransactionsByIds).not.toHaveBeenCalled()
    })

    it('fires exactly 1 transactions call for a page with 2 transaction notifications', async () => {
      const notifications = [
        makeNotification(1, 'transaction', 7),
        makeNotification(2, 'transaction', 8),
      ]
      vi.mocked(transactionsApi.fetchTransactionsByIds).mockResolvedValue([
        makeTransaction(7),
        makeTransaction(8),
      ])
      vi.mocked(chargesApi.fetchChargesByIds).mockResolvedValue({ charges: [] })

      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useResolveNotificationAmounts(notifications), {
        wrapper,
      })

      await waitFor(() => {
        expect(result.current.get('transaction:7')?.amountState).toBe('known')
        expect(result.current.get('transaction:8')?.amountState).toBe('known')
      })

      expect(transactionsApi.fetchTransactionsByIds).toHaveBeenCalledTimes(1)
      expect(transactionsApi.fetchTransactionsByIds).toHaveBeenCalledWith([7, 8])
      expect(chargesApi.fetchChargesByIds).not.toHaveBeenCalled()
    })

    it('fires ≤1 charges + ≤1 transactions for a mixed page with duplicate ids', async () => {
      // Duplicates: charge 10 appears in 3 notifications, transaction 7 in 2
      const notifications = [
        makeNotification(1, 'charge', 10),
        makeNotification(2, 'charge', 10), // duplicate
        makeNotification(3, 'charge', 20),
        makeNotification(4, 'transaction', 7),
        makeNotification(5, 'transaction', 7), // duplicate
      ]
      vi.mocked(chargesApi.fetchChargesByIds).mockResolvedValue({
        charges: [makeCharge(10), makeCharge(20)],
      })
      vi.mocked(transactionsApi.fetchTransactionsByIds).mockResolvedValue([
        makeTransaction(7),
      ])

      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useResolveNotificationAmounts(notifications), {
        wrapper,
      })

      await waitFor(() => {
        expect(result.current.get('charge:10')?.amountState).toBe('known')
        expect(result.current.get('charge:20')?.amountState).toBe('known')
        expect(result.current.get('transaction:7')?.amountState).toBe('known')
      })

      // Exactly 1 call each
      expect(chargesApi.fetchChargesByIds).toHaveBeenCalledTimes(1)
      expect(chargesApi.fetchChargesByIds).toHaveBeenCalledWith([10, 20])
      expect(transactionsApi.fetchTransactionsByIds).toHaveBeenCalledTimes(1)
      expect(transactionsApi.fetchTransactionsByIds).toHaveBeenCalledWith([7])
    })
  })

  describe('amountState: known', () => {
    it('resolves charge with non-null amount to { amount, amountState: "known" }', async () => {
      const notifications = [makeNotification(1, 'charge', 42)]
      vi.mocked(chargesApi.fetchChargesByIds).mockResolvedValue({
        charges: [makeCharge(42, 5000)],
      })

      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useResolveNotificationAmounts(notifications), {
        wrapper,
      })

      await waitFor(() => {
        const entry = result.current.get('charge:42')
        expect(entry).toEqual({ amount: 5000, amountState: 'known' })
      })
    })

    it('resolves transaction to { amount, amountState: "known" }', async () => {
      const notifications = [makeNotification(1, 'transaction', 99)]
      vi.mocked(transactionsApi.fetchTransactionsByIds).mockResolvedValue([
        makeTransaction(99, 15000),
      ])

      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useResolveNotificationAmounts(notifications), {
        wrapper,
      })

      await waitFor(() => {
        const entry = result.current.get('transaction:99')
        expect(entry).toEqual({ amount: 15000, amountState: 'known' })
      })
    })
  })

  describe('amountState: missing', () => {
    it('marks charge id absent from response as missing (IDOR / soft-deleted)', async () => {
      const notifications = [makeNotification(1, 'charge', 55)]
      // Id 55 requested but not in response
      vi.mocked(chargesApi.fetchChargesByIds).mockResolvedValue({ charges: [] })

      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useResolveNotificationAmounts(notifications), {
        wrapper,
      })

      await waitFor(() => {
        expect(result.current.get('charge:55')?.amountState).toBe('missing')
      })
    })

    it('marks charge with null amount as missing', async () => {
      const notifications = [makeNotification(1, 'charge', 11)]
      vi.mocked(chargesApi.fetchChargesByIds).mockResolvedValue({
        charges: [makeCharge(11, null)],
      })

      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useResolveNotificationAmounts(notifications), {
        wrapper,
      })

      await waitFor(() => {
        const entry = result.current.get('charge:11')
        expect(entry).toEqual({ amount: null, amountState: 'missing' })
      })
    })

    it('marks transaction id absent from response as missing', async () => {
      const notifications = [makeNotification(1, 'transaction', 66)]
      vi.mocked(transactionsApi.fetchTransactionsByIds).mockResolvedValue([])

      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useResolveNotificationAmounts(notifications), {
        wrapper,
      })

      await waitFor(() => {
        expect(result.current.get('transaction:66')?.amountState).toBe('missing')
      })
    })
  })

  describe('amountState: loading', () => {
    it('returns loading while the query is in-flight', async () => {
      const notifications = [makeNotification(1, 'charge', 10)]
      // Return a promise that never resolves to simulate in-flight
      vi.mocked(chargesApi.fetchChargesByIds).mockReturnValue(new Promise(() => {}))

      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useResolveNotificationAmounts(notifications), {
        wrapper,
      })

      // Should immediately show loading (query is pending)
      expect(result.current.get('charge:10')?.amountState).toBe('loading')
    })
  })

  describe('empty notifications', () => {
    it('returns an empty map and makes no API calls for empty notification list', () => {
      vi.mocked(chargesApi.fetchChargesByIds).mockResolvedValue({ charges: [] })
      vi.mocked(transactionsApi.fetchTransactionsByIds).mockResolvedValue([])

      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useResolveNotificationAmounts([]), { wrapper })

      expect(result.current.size).toBe(0)
      expect(chargesApi.fetchChargesByIds).not.toHaveBeenCalled()
      expect(transactionsApi.fetchTransactionsByIds).not.toHaveBeenCalled()
    })
  })

  describe('map key format', () => {
    it('keys the map as "entity_type:entity_id"', async () => {
      const notifications = [
        makeNotification(1, 'charge', 1),
        makeNotification(2, 'transaction', 2),
      ]
      vi.mocked(chargesApi.fetchChargesByIds).mockResolvedValue({
        charges: [makeCharge(1, 100)],
      })
      vi.mocked(transactionsApi.fetchTransactionsByIds).mockResolvedValue([
        makeTransaction(2, 200),
      ])

      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useResolveNotificationAmounts(notifications), {
        wrapper,
      })

      await waitFor(() => {
        expect(result.current.has('charge:1')).toBe(true)
        expect(result.current.has('transaction:2')).toBe(true)
      })
    })
  })
})
