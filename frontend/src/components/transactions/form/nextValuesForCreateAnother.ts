import type { Transactions } from "@/types/transactions";
import type { TransactionFormValues } from "./transactionFormSchema";

interface CreateAnotherContext {
  /** All accounts — used to resolve each split's connection default percentage. */
  accounts: Transactions.Account[];
  /** The logged-in user id — decides which side of the connection default applies. */
  currentUserId: number;
}

/**
 * The default split percentage for a connection, from the current user's
 * perspective — mirrors the logic in `SplitSettingsFields`/`SplitRowControls`.
 */
function defaultSplitPercentage(
  accounts: Transactions.Account[],
  connectionId: number,
  currentUserId: number,
): number | undefined {
  const conn = accounts.find((a) => a.user_connection?.id === connectionId)?.user_connection;
  if (!conn) return undefined;
  return conn.from_user_id === currentUserId
    ? conn.from_default_split_percentage
    : conn.to_default_split_percentage;
}

/**
 * Computes the form values to seed the next entry after "Salvar e criar outra".
 *
 * Everything the user just entered is kept — type, date, account, category,
 * destination account, tags and the division (the people it was split with) —
 * so a batch of similar transactions is fast to enter. The per-transaction
 * fields are cleared: amount, description and recurrence.
 *
 * The division is kept but each split is reset to its connection's default
 * percentage with a zeroed amount, so the next transaction's amount drives the
 * split fresh instead of carrying over the previous (possibly fixed) values.
 */
export function nextValuesForCreateAnother(
  values: TransactionFormValues,
  { accounts, currentUserId }: CreateAnotherContext,
): TransactionFormValues {
  return {
    ...values,
    amount: 0,
    description: "",
    recurrenceEnabled: false,
    recurrenceType: "monthly",
    recurrenceCurrentInstallment: null,
    recurrenceTotalInstallments: null,
    split_settings: values.split_settings.map((s) => ({
      ...s,
      amount: 0,
      percentage: defaultSplitPercentage(accounts, s.connection_id, currentUserId) ?? s.percentage,
    })),
  };
}
