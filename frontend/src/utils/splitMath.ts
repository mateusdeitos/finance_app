import { Transactions } from "@/types/transactions";

/**
 * Converts a percentage-based split configuration into cent amounts
 * for a single transaction total.
 *
 * Algorithm (PAY-02):
 *  - Each split receives exactly Math.round(total * percentage / 100).
 *  - Percentages do NOT need to sum to 100 — partial splits (e.g. a single
 *    30% row) are valid and produce a split amount that is strictly the
 *    user-specified share of the transaction.
 *
 * Output shape (PAY-02):
 *  - Each returned entry contains only { connection_id, amount }.
 *  - The `percentage` field is NOT set on the output (backend rejects 400
 *    when both `amount` and `percentage` are present on the same row).
 *
 * @param amount - total transaction amount in cents
 * @param splits - percentage-based rows from BulkDivisionDrawer; each must
 *                 have `connection_id` and `percentage` set
 * @returns new array of `{ connection_id, amount }` where each amount is the
 *          rounded percentage share of the transaction total
 */
export function splitPercentagesToCents(
  amount: number,
  splits: Transactions.SplitSetting[],
): Transactions.SplitSetting[] {
  if (splits.length === 0) return [];

  return splits.map((split) => ({
    connection_id: split.connection_id,
    amount: Math.round((amount * (split.percentage ?? 0)) / 100),
  }));
}
