import { describe, expect, test } from "vitest";
import { Transactions } from "@/types/transactions";
import { splitLabel } from "./TransactionRow";

const baseTransaction: Transactions.Transaction = {
  id: 1,
  user_id: 1,
  type: "expense",
  account_id: 1,
  amount: 10_000,
  operation_type: "debit",
  date: "2026-08-20T00:00:00Z",
  description: "Compra",
};

describe("splitLabel", () => {
  test("shows the badge for a source transaction with split settlements", () => {
    const transaction: Transactions.Transaction = {
      ...baseTransaction,
      settlements_from_source: [
        {
          id: 10,
          user_id: 2,
          amount: 4_000,
          type: "credit",
          account_id: 2,
          source_transaction_id: 1,
          parent_transaction_id: 1,
        },
      ],
    };

    expect(splitLabel(transaction)).toBe("Dividida 60/40");
  });

  test("does not show the badge for a transaction linked through a shared account", () => {
    const transaction: Transactions.Transaction = {
      ...baseTransaction,
      linked_transactions: [
        {
          ...baseTransaction,
          id: 2,
          user_id: 2,
          original_user_id: 2,
          account_id: 2,
        },
      ],
    };

    expect(splitLabel(transaction)).toBeNull();
  });
});
