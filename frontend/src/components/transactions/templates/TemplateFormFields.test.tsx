import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { QueryKeys } from "@/utils/queryKeys";
import { TransactionsTestIds } from "@/testIds";
import type { TemplateFormValues } from "./templateFormSchema";
import { TemplateFormFields } from "./TemplateFormFields";

function TemplateFormHarness() {
  const form = useForm<TemplateFormValues>({
    defaultValues: {
      name: "Modelo",
      transaction_type: "expense",
      description: "",
      account_id: 0,
      category_id: null,
      destination_account_id: null,
      tags: [],
      split_settings: [],
    },
  });

  return (
    <FormProvider {...form}>
      <TemplateFormFields />
    </FormProvider>
  );
}

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData([QueryKeys.Accounts], []);
  client.setQueryData([QueryKeys.Categories], []);
  client.setQueryData([QueryKeys.Tags], []);
  client.setQueryData([QueryKeys.Me], { id: 1, name: "Me", email: "me@example.com" });

  return render(
    <QueryClientProvider client={client}>
      <MantineProvider>
        <TemplateFormHarness />
      </MantineProvider>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

test("uses the selected type color in the template type selector", () => {
  renderForm();

  const selector = screen.getByTestId(TransactionsTestIds.SegmentedTransactionType);
  expect(selector.style.getPropertyValue("--sc-color")).toBe("var(--mantine-color-red-filled)");

  fireEvent.click(screen.getByRole("radio", { name: "Receita" }));
  expect(selector.style.getPropertyValue("--sc-color")).toBe("var(--mantine-color-teal-filled)");
});
