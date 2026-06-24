import { expect, test } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { QueryKeys } from "@/utils/queryKeys";
import { Transactions } from "@/types/transactions";
import { TransactionForm } from "./TransactionForm";
import { transactionFormSchema, type TransactionFormValues } from "./transactionFormSchema";

const privateAccount: Transactions.Account = {
  id: 1,
  user_id: 1,
  name: "Mine",
  initial_balance: 0,
  is_active: true,
  position: 0,
};

const connAccount: Transactions.Account = {
  id: 2,
  user_id: 1,
  name: "Partner",
  initial_balance: 0,
  is_active: true,
  position: 0,
  user_connection: {
    id: 10,
    from_user_id: 1,
    from_account_id: 1,
    from_default_split_percentage: 50,
    to_user_id: 2,
    to_account_id: 2,
    to_default_split_percentage: 50,
    connection_status: "accepted",
  },
};

function makeClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData([QueryKeys.Accounts], [privateAccount, connAccount]);
  qc.setQueryData([QueryKeys.Categories], []);
  qc.setQueryData([QueryKeys.Tags], []);
  qc.setQueryData([QueryKeys.Me], { id: 1, name: "Me", email: "m@e.com" });
  return qc;
}

function Harness() {
  const methods = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      transaction_type: "expense",
      date: "2026-05-10",
      description: "x",
      amount: 10000,
      account_id: 1,
      category_id: null,
      destination_account_id: null,
      tags: [],
      split_settings: [{ connection_id: 10, amount: 5000, date: null }],
      recurrenceEnabled: false,
      recurrenceType: "monthly",
      recurrenceCurrentInstallment: null,
      recurrenceTotalInstallments: null,
    },
  });
  return (
    <FormProvider {...methods}>
      <TransactionForm onSubmitPayload={() => {}} />
    </FormProvider>
  );
}

// Regression: a split row that opens in fixed-amount mode renders a CurrencyInput
// bound to the RHF field ref. If CurrencyInput's imperative handle is recreated
// every render, the ref churn drives an infinite setValue → re-render loop.
test("renders update form for a transaction with split settings without an update loop", () => {
  expect(() =>
    render(
      <QueryClientProvider client={makeClient()}>
        <MantineProvider>
          <Harness />
        </MantineProvider>
      </QueryClientProvider>,
    ),
  ).not.toThrow();
});
