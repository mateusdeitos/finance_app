import { afterEach, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { QueryKeys } from "@/utils/queryKeys";
import { Transactions } from "@/types/transactions";
import { TransactionsTestIds } from "@/testIds";
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

function Harness({ accountId = 1 }: { accountId?: number }) {
  const methods = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      transaction_type: "expense",
      date: "2026-05-10",
      description: "x",
      amount: 10000,
      account_id: accountId,
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

// Testing Library's cleanup is not automatic here; without it, DOM from earlier
// renders accumulates and pollutes testid queries across tests.
afterEach(cleanup);

function renderHarness(accountId?: number) {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MantineProvider>
        <Harness accountId={accountId} />
      </MantineProvider>
    </QueryClientProvider>,
  );
}

// Regression: a split row that opens in fixed-amount mode renders a CurrencyInput
// bound to the RHF field ref. If CurrencyInput's imperative handle is recreated
// every render, the ref churn drives an infinite setValue → re-render loop.
test("renders update form for a transaction with split settings without an update loop", () => {
  expect(() => renderHarness()).not.toThrow();
});

// A transaction on a shared (connection) account can never have splits. Even when
// split_settings arrives populated (e.g. the edit flow misreading the partner's
// mirrored linked transactions), the "Divisão" section must stay hidden.
test("hides the Divisão section when the selected account is shared, even with split_settings", () => {
  const { queryByTestId } = renderHarness(connAccount.id);
  expect(queryByTestId(TransactionsTestIds.SegmentExtraSection("split"))).toBeNull();
});

// Regression: a private-account transaction that already carries splits must
// still show the "Divisão" section.
test("shows the Divisão section for a private account that already has split_settings", () => {
  const { queryByTestId } = renderHarness(privateAccount.id);
  expect(queryByTestId(TransactionsTestIds.SegmentExtraSection("split"))).not.toBeNull();
});
