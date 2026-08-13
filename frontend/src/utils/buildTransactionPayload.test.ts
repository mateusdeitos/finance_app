import { expect, test } from "vitest";
import type { TransactionFormValues } from "@/components/transactions/form/transactionFormSchema";
import { buildTransactionPayload } from "./buildTransactionPayload";

const baseValues: TransactionFormValues = {
  transaction_type: "expense",
  date: "2026-08-13",
  description: "Imec",
  amount: 10_000,
  account_id: 7,
  category_id: 49,
  destination_account_id: null,
  tags: [],
  split_settings: [],
  recurrenceEnabled: false,
  recurrenceType: null,
  recurrenceCurrentInstallment: null,
  recurrenceTotalInstallments: null,
};

test("keeps a template percentage split when creating the transaction", () => {
  const payload = buildTransactionPayload(
    {
      ...baseValues,
      split_settings: [
        {
          connection_id: 1,
          percentage: 37,
          // The visible amount is derived from the form total, but the API
          // accepts exactly one split mode.
          amount: 3_700,
          date: "2026-08-13",
        },
      ],
    },
    [],
  );

  expect(payload.split_settings).toEqual([
    { connection_id: 1, percentage: 37, date: "2026-08-13" },
  ]);
});
