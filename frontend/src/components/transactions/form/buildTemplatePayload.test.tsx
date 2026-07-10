import { expect, test } from "vitest";
import { Transactions } from "@/types/transactions";
import { buildTemplateFormPatch } from "./applyTemplate";
import { buildTemplatePayloadFromForm } from "./buildTemplatePayload";
import type { TransactionFormValues } from "./transactionFormSchema";

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

const baseValues: TransactionFormValues = {
  transaction_type: "expense",
  description: "Lunch",
  amount: 2500,
  account_id: 1,
  category_id: 10,
  destination_account_id: null,
  split_settings: [],
  recurrenceEnabled: false,
  recurrenceType: null,
  recurrenceCurrentInstallment: null,
  recurrenceTotalInstallments: null,
  date: "2026-07-10",
  tags: [],
};

test("builds a payload for an expense with tags + split (no amount/date keys)", () => {
  const values: TransactionFormValues = {
    ...baseValues,
    tags: ["work", "personal"],
    split_settings: [{ connection_id: 5, percentage: 50 }],
  };

  const payload = buildTemplatePayloadFromForm(values, tags);

  expect(payload).toEqual({
    type: "expense",
    description: "Lunch",
    account_id: 1,
    category_id: 10,
    destination_account_id: undefined,
    tag_ids: [100, 101],
    split_settings: [{ connection_id: 5, percentage: 50, amount: undefined, date: undefined }],
  });
  expect(payload).not.toHaveProperty("amount");
  expect(payload).not.toHaveProperty("date");
});

test("drops a tag name with no matching tag", () => {
  const values: TransactionFormValues = { ...baseValues, tags: ["work", "unknown"] };

  const payload = buildTemplatePayloadFromForm(values, tags);

  expect(payload.tag_ids).toEqual([100]);
});

test("transfer: category_id/split_settings undefined, destination_account_id set", () => {
  const values: TransactionFormValues = {
    ...baseValues,
    transaction_type: "transfer",
    category_id: null,
    destination_account_id: 2,
    split_settings: [{ connection_id: 5, percentage: 50 }],
  };

  const payload = buildTemplatePayloadFromForm(values, tags);

  expect(payload.category_id).toBeUndefined();
  expect(payload.split_settings).toBeUndefined();
  expect(payload.destination_account_id).toBe(2);
  expect(payload.type).toBe("transfer");
});

test("no tags / no split -> tag_ids and split_settings are undefined, not empty arrays", () => {
  const payload = buildTemplatePayloadFromForm(baseValues, tags);

  expect(payload.tag_ids).toBeUndefined();
  expect(payload.split_settings).toBeUndefined();
});

test("round-trip: buildTemplateFormPatch(buildTemplatePayloadFromForm(values, tags)) preserves core fields", () => {
  const values: TransactionFormValues = {
    ...baseValues,
    tags: ["work", "personal"],
  };

  const payload = buildTemplatePayloadFromForm(values, tags);
  const patch = buildTemplateFormPatch(payload, { accounts, categories, tags });

  expect(patch.transaction_type).toBe(values.transaction_type);
  expect(patch.description).toBe(values.description);
  expect(patch.account_id).toBe(values.account_id);
  expect(patch.category_id).toBe(values.category_id);
  expect(patch.tags).toEqual(values.tags);
});
