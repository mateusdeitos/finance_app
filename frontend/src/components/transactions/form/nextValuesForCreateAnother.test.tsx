import { expect, test } from "vitest";
import { nextValuesForCreateAnother } from "./nextValuesForCreateAnother";
import type { TransactionFormValues } from "./transactionFormSchema";
import type { Transactions } from "@/types/transactions";

const CURRENT_USER_ID = 1;

// The current user is the `from` side of the connection, so its default split
// percentage is `from_default_split_percentage` (70).
const partnerAccount: Transactions.Account = {
  id: 2,
  user_id: 1,
  name: "Partner",
  initial_balance: 0,
  is_active: true,
  position: 0,
  user_connection: {
    id: 10,
    from_user_id: CURRENT_USER_ID,
    from_account_id: 1,
    from_default_split_percentage: 70,
    to_user_id: 2,
    to_account_id: 2,
    to_default_split_percentage: 30,
    connection_status: "accepted",
  },
};

const accounts = [partnerAccount];

const submitted: TransactionFormValues = {
  transaction_type: "expense",
  date: "2026-05-10",
  description: "Mercado",
  amount: 5000,
  account_id: 7,
  category_id: 3,
  destination_account_id: null,
  tags: ["fixo", "casa"],
  // A fixed-amount split (percentage cleared, amount set) — the case that used
  // to carry a stale amount into the next entry.
  split_settings: [{ connection_id: 10, amount: 3000, date: "2026-05-01" }],
  recurrenceEnabled: true,
  recurrenceType: "monthly",
  recurrenceCurrentInstallment: 2,
  recurrenceTotalInstallments: 12,
};

const ctx = { accounts, currentUserId: CURRENT_USER_ID };

test("keeps type, date, account, category, destination and tags", () => {
  const next = nextValuesForCreateAnother(submitted, ctx);

  expect(next.transaction_type).toBe("expense");
  expect(next.date).toBe("2026-05-10");
  expect(next.account_id).toBe(7);
  expect(next.category_id).toBe(3);
  expect(next.destination_account_id).toBeNull();
  expect(next.tags).toEqual(["fixo", "casa"]);
});

test("clears amount, description and recurrence for the next entry", () => {
  const next = nextValuesForCreateAnother(submitted, ctx);

  expect(next.amount).toBe(0);
  expect(next.description).toBe("");
  expect(next.recurrenceEnabled).toBe(false);
  expect(next.recurrenceType).toBe("monthly");
  expect(next.recurrenceCurrentInstallment).toBeNull();
  expect(next.recurrenceTotalInstallments).toBeNull();
});

test("keeps the division but zeroes each split amount and applies the default percentage", () => {
  const next = nextValuesForCreateAnother(submitted, ctx);

  expect(next.split_settings).toEqual([
    { connection_id: 10, amount: 0, percentage: 70, date: "2026-05-01" },
  ]);
});

test("uses the `to` side default percentage when the current user is the partner", () => {
  const next = nextValuesForCreateAnother(submitted, { accounts, currentUserId: 2 });
  expect(next.split_settings[0].percentage).toBe(30);
});

test("falls back to the existing percentage when the connection is unknown", () => {
  const orphan: TransactionFormValues = {
    ...submitted,
    split_settings: [{ connection_id: 999, percentage: 55, amount: 3000, date: null }],
  };
  const next = nextValuesForCreateAnother(orphan, ctx);
  expect(next.split_settings).toEqual([
    { connection_id: 999, amount: 0, percentage: 55, date: null },
  ]);
});

test("does not mutate the submitted values", () => {
  const snapshot = structuredClone(submitted);
  nextValuesForCreateAnother(submitted, ctx);
  expect(submitted).toEqual(snapshot);
});
