import { afterEach, expect, test } from "vitest";
import { act, cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FormProvider, useForm, type UseFormSetValue } from "react-hook-form";
import { QueryKeys } from "@/utils/queryKeys";
import { Transactions } from "@/types/transactions";
import { TransactionsTestIds } from "@/testIds";
import { SplitSettingsFields } from "./SplitSettingsFields";

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
  position: 1,
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
  qc.setQueryData([QueryKeys.Me], { id: 1, name: "Me", email: "m@e.com" });
  return qc;
}

interface HarnessFormValues {
  amount: number;
  split_settings: Transactions.SplitSetting[];
}

function Harness({
  templateMode,
  amount,
  onForm,
  onReady,
}: {
  templateMode?: boolean;
  amount: number;
  onForm?: (getValues: () => HarnessFormValues) => void;
  onReady?: (setValue: UseFormSetValue<HarnessFormValues>) => void;
}) {
  const methods = useForm<HarnessFormValues>({
    defaultValues: {
      amount,
      split_settings: templateMode ? [{ connection_id: 10, percentage: 37 }] : [{ connection_id: 10, amount: 0 }],
    },
  });
  onForm?.(methods.getValues);
  onReady?.(methods.setValue);
  return (
    <FormProvider {...methods}>
      <SplitSettingsFields templateMode={templateMode} />
    </FormProvider>
  );
}

afterEach(cleanup);

function renderHarness(props: {
  templateMode?: boolean;
  amount: number;
  onForm?: (getValues: () => HarnessFormValues) => void;
  onReady?: (setValue: UseFormSetValue<HarnessFormValues>) => void;
}) {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MantineProvider>
        <Harness {...props} />
      </MantineProvider>
    </QueryClientProvider>,
  );
}

// Success criterion 1: in template mode the per-row preview and the "Soma" footer
// are suppressed entirely (no placeholder text) — see 28-CONTEXT.md D-01.
test("template mode suppresses per-row preview and Soma footer", () => {
  renderHarness({ templateMode: true, amount: 0 });

  expect(screen.queryByTestId(TransactionsTestIds.SplitSumFooter)).toBeNull();
  expect(screen.getByTestId(TransactionsTestIds.SplitRowPreview(0)).textContent).toBe("");
});

// Success criterion 2: the %/R$ toggle remains fully functional in template mode
// even though there is no amount field driving a live calculation.
test("percentage/amount toggle still switches the per-row input in template mode", () => {
  renderHarness({ templateMode: true, amount: 0 });

  expect(screen.getByTestId(TransactionsTestIds.InputSplitPercentage)).toBeTruthy();

  fireEvent.click(screen.getByTestId(TransactionsTestIds.SegmentSplitMode("amount")));
  expect(screen.getByTestId(TransactionsTestIds.InputSplitAmount)).toBeTruthy();

  fireEvent.click(screen.getByTestId(TransactionsTestIds.SegmentSplitMode("percentage")));
  expect(screen.getByTestId(TransactionsTestIds.InputSplitPercentage)).toBeTruthy();
});

test("template percentage preserves its saved value without writing amount or date", async () => {
  let getValues: (() => HarnessFormValues) | undefined;
  renderHarness({
    templateMode: true,
    amount: 0,
    onForm: (nextGetValues) => {
      getValues = nextGetValues;
    },
  });

  await waitFor(() => expect(getValues?.().split_settings[0]?.percentage).toBe(37));
  expect(getValues?.().split_settings[0]).toEqual({ connection_id: 10, percentage: 37 });
  expect(screen.queryByTestId(TransactionsTestIds.InputSplitDate(0))).toBeNull();
  expect((screen.getByTestId(TransactionsTestIds.InputSplitPercentage) as HTMLInputElement).value).toBe("37%");
});

test("an externally applied fixed split switches the editor to R$ mode", async () => {
  let setValue: UseFormSetValue<HarnessFormValues> | undefined;
  renderHarness({
    amount: 10_000,
    onReady: (nextSetValue) => {
      setValue = nextSetValue;
    },
  });

  act(() => {
    setValue?.("split_settings", [{ connection_id: 10, amount: 2500 }]);
  });

  await waitFor(() => expect(screen.getByTestId(TransactionsTestIds.InputSplitAmount)).toBeTruthy());
  expect(screen.queryByTestId(TransactionsTestIds.InputSplitPercentage)).toBeNull();
});

// Success criterion 3: the additive templateMode prop (default false) does not
// change existing (non-template) transaction-form behavior.
test("non-template mode still renders the per-row preview and Soma footer", () => {
  renderHarness({ amount: 10000 });

  expect(screen.getByTestId(TransactionsTestIds.SplitSumFooter)).toBeTruthy();
  expect(screen.getByTestId(TransactionsTestIds.SplitRowPreview(0)).textContent).not.toBe("");
});
