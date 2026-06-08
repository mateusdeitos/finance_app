import { Transactions } from '@/types/transactions'

/** Lowercases and strips diacritics so "união" and "uniao" compare equal. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** Formats an unsigned cent amount as "reais,centavos" (no thousands separator). */
function formatAmountForSearch(amountCents: number): string {
  return (Math.abs(amountCents) / 100).toFixed(2).replace('.', ',')
}

/**
 * Matches a transaction against the free-text search box.
 *
 * The query matches when it is an accent-insensitive substring of the
 * description (so "uniao" finds "união") OR a partial match of the amount
 * formatted as "reais,centavos" — so "50" matches 50,10 / 50,00 / 1,50 and
 * "1,5" matches 1,50 / 21,56 / 1,59. A "." typed by the user is treated as the
 * decimal comma, so "1.5" behaves like "1,5".
 */
export function matchesTransactionSearch(
  tx: Pick<Transactions.Transaction, 'description' | 'amount'>,
  query: string,
): boolean {
  const trimmed = query.trim()
  if (!trimmed) return true

  if (normalize(tx.description).includes(normalize(trimmed))) return true

  const amountQuery = trimmed.replace(/\./g, ',')
  return formatAmountForSearch(tx.amount).includes(amountQuery)
}
