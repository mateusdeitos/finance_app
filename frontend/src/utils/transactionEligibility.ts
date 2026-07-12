import { Transactions } from "@/types/transactions";

type DeletableTransaction = Pick<
  Transactions.Transaction,
  "original_user_id" | "user_id" | "origin_settlement_id"
>;

/**
 * Whether the current user is allowed to delete this transaction.
 *
 * Mirrors the backend authorization (a user related to the row may delete it:
 * `OriginalUserID == nil || *OriginalUserID == userID || UserID == userID`) and
 * the `isOwner` gate in TransactionGroup. In particular it allows the "ponta"
 * (the partner who owns the mirrored side of a shared transaction, so
 * `user_id === currentUserId` while `original_user_id` is the author).
 *
 * Synthetic settlement rows (`origin_settlement_id` set) are not real
 * transactions and cannot be deleted here.
 */
export function canDeleteTransaction(
  tx: DeletableTransaction | undefined,
  currentUserId: number | undefined,
): boolean {
  if (!tx) return false;
  if (tx.origin_settlement_id !== undefined) return false;
  return (
    tx.original_user_id == null ||
    tx.original_user_id === currentUserId ||
    tx.user_id === currentUserId
  );
}
