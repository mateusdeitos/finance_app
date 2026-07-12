import { afterEach, expect, test, vi } from "vitest";
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

const account: Transactions.Account = {
  id: 1,
  user_id: 1,
  name: "Mine",
  initial_balance: 0,
  is_active: true,
  position: 0,
};

const category: Transactions.Category = {
  id: 5,
  user_id: 1,
  name: "Food",
  emoji: "🍔",
};

function makeClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData([QueryKeys.Accounts], [account]);
  qc.setQueryData([QueryKeys.Categories], [category]);
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
      split_settings: [],
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

function renderHarness() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MantineProvider>
        <Harness />
      </MantineProvider>
    </QueryClientProvider>,
  );
}

/** Forces `useIsMobile` (Mantine `useMediaQuery('(max-width: 48em)')`) on/off. */
function mockViewport(isMobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("48em") ? isMobile : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
});

// On mobile the date field and the account/category selects fall back to native
// controls (<input type="date"> / <select>) for a better touch experience.
test("renders native date input and native selects on mobile", () => {
  mockViewport(true);
  const { container, getByTestId } = renderHarness();

  expect(container.querySelector('input[type="date"]')).not.toBeNull();
  expect(getByTestId(TransactionsTestIds.SelectAccount).tagName).toBe("SELECT");
  expect(getByTestId(TransactionsTestIds.SelectCategory).tagName).toBe("SELECT");
});

// On desktop the richer Mantine combobox + calendar popover are kept. The
// combobox trigger is an <input>, and DatePickerInput renders a <button>
// trigger (never a native date input).
test("renders Mantine combobox selects and no native date input on desktop", () => {
  mockViewport(false);
  const { container, getByTestId } = renderHarness();

  expect(container.querySelector('input[type="date"]')).toBeNull();
  expect(getByTestId(TransactionsTestIds.SelectAccount).tagName).toBe("INPUT");
  expect(getByTestId(TransactionsTestIds.SelectCategory).tagName).toBe("INPUT");
});
