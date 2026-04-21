import { Transactions } from "@/types/transactions";

/**
 * Converts a percentage-based split configuration into cent-exact amounts
 * for a single transaction total.
 *
 * Algorithm (PAY-01):
 *  - For every split at index `i < splits.length - 1`:
 *      amount = Math.round(total * percentage / 100)
 *  - The LAST split (index `splits.length - 1`) absorbs the rounding
 *    remainder: amount = total - Σ(previous amounts). This guarantees
 *    Σ amount === total exactly for any percentage mix.
 *  - "Last" is the last element in the input array's order. Deterministic;
 *    no sort step.
 *
 * Output shape (PAY-02):
 *  - Each returned entry contains only { connection_id, amount }.
 *  - The `percentage` field is NOT set on the output (backend rejects 400
 *    when both `amount` and `percentage` are present on the same row).
 *
 * @param amount - total transaction amount in cents
 * @param splits - percentage-based rows from BulkDivisionDrawer; each must
 *                 have `connection_id` and `percentage` set
 * @returns new array of `{ connection_id, amount }` with Σ amount === amount
 */
export function splitPercentagesToCents(
  amount: number,
  splits: Transactions.SplitSetting[],
): Transactions.SplitSetting[] {
  if (splits.length === 0) return [];

  const result: Transactions.SplitSetting[] = [];
  let runningSum = 0;

  for (let i = 0; i < splits.length - 1; i++) {
    const pct = splits[i].percentage ?? 0;
    const cents = Math.round((amount * pct) / 100);
    result.push({ connection_id: splits[i].connection_id, amount: cents });
    runningSum += cents;
  }

  // Last split absorbs the rounding remainder.
  const last = splits[splits.length - 1];
  result.push({ connection_id: last.connection_id, amount: amount - runningSum });

  return result;
}
