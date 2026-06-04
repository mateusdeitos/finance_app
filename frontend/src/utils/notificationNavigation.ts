/**
 * Pure helper: builds the /transactions search params used when a user taps a
 * notification row whose entity is a transaction. The resolved transaction's
 * date drives the month/year filter and its persisted description becomes the
 * free-text `query` filter.
 *
 * No React, no hooks — trivially unit-testable.
 */

export interface TransactionNavSearch {
  month: number
  year: number
  query: string
}

/**
 * Derives the { month, year, query } search object from a transaction's ISO
 * date string and its description. Returns null when the date is missing or
 * unparseable, signalling the caller to fall back to the plain /transactions
 * deep link (no filter).
 *
 * - month is 1-12 (calendar month), matching transactionSearchSchema.
 * - query is the description, or '' when absent (schema default).
 */
export function buildTransactionSearchFromNotification(
  date: string | null,
  description: string | null,
): TransactionNavSearch | null {
  if (date == null) return null
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return null
  return {
    month: parsed.getMonth() + 1,
    year: parsed.getFullYear(),
    query: description ?? '',
  }
}
