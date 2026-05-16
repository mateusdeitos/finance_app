import { test } from "node:test";
import { strict as assert } from "node:assert";
import { groupTransactions } from "./groupTransactions";
import type { Transactions } from "../types/transactions";

const PRIVATE_ACCOUNT = 1;
const CONNECTION_ACCOUNT = 99;

function settlement(date: string): Transactions.Settlement {
  return {
    id: 500,
    user_id: 1,
    amount: 5000,
    type: "credit",
    account_id: CONNECTION_ACCOUNT,
    source_transaction_id: 10,
    parent_transaction_id: 0,
    date,
  };
}

function sourceTransaction(
  settlements: Transactions.Settlement[],
): Transactions.Transaction {
  return {
    id: 10,
    user_id: 1,
    type: "expense",
    account_id: PRIVATE_ACCOUNT,
    amount: 10000,
    operation_type: "debit",
    date: "2026-05-10",
    description: "split expense",
    settlements_from_source: settlements,
  };
}

function flatten(groups: Transactions.TransactionGroup[]): Transactions.Transaction[] {
  return groups.flatMap((g) => g.transactions);
}

function syntheticSettlementRows(
  groups: Transactions.TransactionGroup[],
): Transactions.Transaction[] {
  return flatten(groups).filter((tx) => tx.origin_settlement_id !== undefined);
}

test("altered-date settlement is promoted to its own row when no account filter is active", () => {
  const groups = groupTransactions(
    [sourceTransaction([settlement("2026-05-20")])],
    "date",
    [],
    [],
    [],
  );
  assert.equal(syntheticSettlementRows(groups).length, 1);
});

test("altered-date settlement is NOT promoted when filtering by the private source account", () => {
  // The settlement belongs to the connection account; filtering by the
  // private account where the source expense lives must not surface it.
  const groups = groupTransactions(
    [sourceTransaction([settlement("2026-05-20")])],
    "date",
    [],
    [],
    [PRIVATE_ACCOUNT],
  );
  assert.equal(syntheticSettlementRows(groups).length, 0);

  // It stays inline under the source, where the per-account render/total
  // filters exclude it.
  const source = flatten(groups).find((tx) => tx.id === 10);
  assert.ok(source);
  assert.equal((source.settlements_from_source ?? []).length, 1);
});

test("altered-date settlement is promoted when the filter includes its connection account", () => {
  const groups = groupTransactions(
    [sourceTransaction([settlement("2026-05-20")])],
    "date",
    [],
    [],
    [PRIVATE_ACCOUNT, CONNECTION_ACCOUNT],
  );
  assert.equal(syntheticSettlementRows(groups).length, 1);
});

test("same-date settlement is never promoted regardless of the account filter", () => {
  for (const filter of [[], [PRIVATE_ACCOUNT], [CONNECTION_ACCOUNT]]) {
    const groups = groupTransactions(
      [sourceTransaction([settlement("2026-05-10")])],
      "date",
      [],
      [],
      filter,
    );
    assert.equal(syntheticSettlementRows(groups).length, 0);
  }
});
