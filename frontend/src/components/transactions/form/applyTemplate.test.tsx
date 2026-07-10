import { expect, test } from "vitest";
import { Transactions } from "@/types/transactions";
import { buildTemplateFormPatch } from "./applyTemplate";

const accounts: Transactions.Account[] = [
  { id: 1, user_id: 1, name: "Wallet", initial_balance: 0, is_active: true, position: 0 },
  { id: 2, user_id: 1, name: "Bank", initial_balance: 0, is_active: true, position: 1 },
];

const categories: Transactions.Category[] = [
  { id: 10, user_id: 1, name: "Food" },
  { id: 11, user_id: 1, name: "Transport" },
];

const tags: Transactions.Tag[] = [
  { id: 100, user_id: 1, name: "work" },
  { id: 101, user_id: 1, name: "personal" },
];

const splitSettings: Transactions.SplitSetting[] = [{ connection_id: 5, percentage: 50 }];

test("maps all fields for a fully-valid payload", () => {
  const payload: Transactions.TemplatePayload = {
    type: "expense",
    description: "Lunch",
    account_id: 1,
    category_id: 10,
    destination_account_id: 2,
    tag_ids: [100, 101],
    split_settings: splitSettings,
  };

  const patch = buildTemplateFormPatch(payload, { accounts, categories, tags });

  expect(patch).toEqual({
    transaction_type: "expense",
    description: "Lunch",
    account_id: 1,
    category_id: 10,
    destination_account_id: 2,
    tags: ["work", "personal"],
    split_settings: splitSettings,
  });
});

test("clears a stale account_id to the unselected sentinel (0)", () => {
  const payload: Transactions.TemplatePayload = {
    type: "expense",
    description: "Lunch",
    account_id: 999,
  };

  const patch = buildTemplateFormPatch(payload, { accounts, categories, tags });

  expect(patch.account_id).toBe(0);
  expect(patch.description).toBe("Lunch");
  expect(patch.transaction_type).toBe("expense");
});

test("clears a stale category_id to null", () => {
  const payload: Transactions.TemplatePayload = {
    type: "income",
    description: "Salary",
    category_id: 999,
  };

  const patch = buildTemplateFormPatch(payload, { accounts, categories, tags });

  expect(patch.category_id).toBeNull();
  expect(patch.description).toBe("Salary");
});

test("drops stale tag_ids while keeping valid ones as names", () => {
  const payload: Transactions.TemplatePayload = {
    type: "expense",
    description: "Groceries",
    tag_ids: [100, 999, 101],
  };

  const patch = buildTemplateFormPatch(payload, { accounts, categories, tags });

  expect(patch.tags).toEqual(["work", "personal"]);
});

test("handles empty/omitted optional fields without throwing", () => {
  const payload: Transactions.TemplatePayload = {
    type: "expense",
    description: "Misc",
  };

  const patch = buildTemplateFormPatch(payload, { accounts, categories, tags });

  expect(patch.tags).toEqual([]);
  expect(patch.split_settings).toEqual([]);
  expect(patch.account_id).toBe(0);
  expect(patch.category_id).toBeNull();
  expect(patch.destination_account_id).toBeNull();
});
