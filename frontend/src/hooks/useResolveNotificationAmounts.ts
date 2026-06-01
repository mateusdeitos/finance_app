import { useQuery } from '@tanstack/react-query'
import { fetchChargesByIds } from '@/api/charges'
import { fetchTransactionsByIds } from '@/api/transactions'
import { QueryKeys } from '@/utils/queryKeys'
import { Notifications } from '@/types/notifications'

export type AmountState = 'known' | 'loading' | 'missing'

export type ResolvedAmount = {
  amount: number | null
  amountState: AmountState
  /**
   * The resolved entity's date (ISO 8601), surfaced so the row can build the
   * /transactions month/year navigation filter without an extra fetch. null
   * when the entity is missing (IDOR / soft-deleted) or carries no date.
   */
  date: string | null
  /**
   * The resolved entity's description, surfaced so the row can pass it as the
   * /transactions `query` text filter and into describeNotification. null when
   * the entity is missing or has no description.
   */
  description: string | null
}

/**
 * Page-level batch resolver: given a list of notifications (one page), fires at
 * most ONE charges query and ONE transactions query (≤2 requests total). Distinct
 * entity_ids are sorted so the query key is stable across re-renders.
 *
 * Returns a Map keyed `"${entity_type}:${entity_id}"` → `{ amount, amountState }`.
 * amountState:
 *   'known'   — id is in the response and has a non-null amount
 *   'loading' — query is in-flight for this id
 *   'missing' — id was requested but absent from the response (IDOR / soft-deleted)
 */
export function useResolveNotificationAmounts(
  notifications: Notifications.Notification[],
): Map<string, ResolvedAmount> {
  // Collect distinct, sorted id sets per entity_type
  const chargeIds = [...new Set(
    notifications
      .filter((n) => n.entity_type === 'charge')
      .map((n) => n.entity_id),
  )].sort((a, b) => a - b)

  const transactionIds = [...new Set(
    notifications
      .filter((n) => n.entity_type === 'transaction')
      .map((n) => n.entity_id),
  )].sort((a, b) => a - b)

  // ≤1 charges query per page
  const chargesQuery = useQuery({
    queryKey: [QueryKeys.NotificationChargesById, chargeIds],
    queryFn: () => fetchChargesByIds(chargeIds),
    enabled: chargeIds.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // ≤1 transactions query per page
  const transactionsQuery = useQuery({
    queryKey: [QueryKeys.NotificationTransactionsById, transactionIds],
    queryFn: () => fetchTransactionsByIds(transactionIds),
    enabled: transactionIds.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // Build result map (pure derivation — no useEffect)
  const result = new Map<string, ResolvedAmount>()

  for (const n of notifications) {
    const key = `${n.entity_type}:${n.entity_id}`
    if (result.has(key)) continue // already resolved this key

    if (n.entity_type === 'charge') {
      if (chargeIds.length === 0) {
        // No charge ids requested — shouldn't happen if entity_type = charge
        result.set(key, { amount: null, amountState: 'missing', date: null, description: null })
      } else if (chargesQuery.isPending) {
        result.set(key, { amount: null, amountState: 'loading', date: null, description: null })
      } else {
        const found = chargesQuery.data?.charges.find((c) => c.id === n.entity_id)
        if (found != null && found.amount != null) {
          result.set(key, {
            amount: found.amount,
            amountState: 'known',
            date: found.date ?? null,
            description: found.description ?? null,
          })
        } else {
          // Either not in response (IDOR / soft-deleted) or amount is null
          result.set(key, { amount: null, amountState: 'missing', date: null, description: null })
        }
      }
    } else {
      // entity_type === 'transaction'
      if (transactionIds.length === 0) {
        result.set(key, { amount: null, amountState: 'missing', date: null, description: null })
      } else if (transactionsQuery.isPending) {
        result.set(key, { amount: null, amountState: 'loading', date: null, description: null })
      } else {
        const found = transactionsQuery.data?.find((t) => t.id === n.entity_id)
        if (found != null) {
          result.set(key, {
            amount: found.amount,
            amountState: 'known',
            date: found.date ?? null,
            description: found.description ?? null,
          })
        } else {
          // Not in response (IDOR / soft-deleted)
          result.set(key, { amount: null, amountState: 'missing', date: null, description: null })
        }
      }
    }
  }

  return result
}
