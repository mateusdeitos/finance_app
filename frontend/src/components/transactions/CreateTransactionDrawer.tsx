import { useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Drawer } from "@mantine/core";
import { useCategories } from "@/hooks/useCategories";
import { useMe } from "@/hooks/useMe";
import { useTransactionPrefill } from "@/hooks/useTransactionPrefill";
import { useCreateTransaction } from "@/hooks/useCreateTransaction";
import { useAccounts } from "@/hooks/useAccounts";
import { Transactions } from "@/types/transactions";
import { parseApiError, mapTagsToFieldErrors } from "@/utils/apiErrors";
import { useDrawerContext } from "@/utils/renderDrawer";
import {
  transactionFormSchema,
  TransactionFormValues,
} from "./form/transactionFormSchema";
import { TransactionForm } from "./form/TransactionForm";

const TYPE_LABELS: Record<Transactions.TransactionType, string> = {
  expense: "Nova Despesa",
  income: "Nova Receita",
  transfer: "Nova Transferência",
};

export function CreateTransactionDrawer() {
  const { opened, close } = useDrawerContext<void>();
  const [transactionType, setTransactionType] =
    useState<Transactions.TransactionType>("expense");
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string> | undefined
  >();

  const { query: meQuery } = useMe((me) => me.id);
  const currentUserId = meQuery.data ?? 0;

  const { query: accountsQuery } = useAccounts();
  const { query: categoriesQuery } = useCategories();

  const accounts = accountsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  const { prefill, savePrefill } = useTransactionPrefill({
    userId: currentUserId,
    accounts,
    categories,
  });

  const methods = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      transaction_type: "expense",
      date: prefill.date ?? new Date().toISOString().split("T")[0],
      description: "",
      amount: 0,
      account_id: prefill.accountId ?? null,
      category_id: prefill.categoryId ?? null,
      destination_account_id: null,
      tags: [],
      split_settings: [],
      recurrenceEnabled: false,
      recurrenceType: "monthly",
      recurrenceEndDateMode: false,
      recurrenceEndDate: null,
      recurrenceRepetitions: null,
    },
  });

  const { mutation } = useCreateTransaction();

  function handleSubmitPayload(payload: Transactions.CreateTransactionPayload) {
    setSubmitError(undefined);
    setFieldErrors(undefined);
    mutation.mutate(payload, {
      onSuccess: () => {
        savePrefill(
          payload.date,
          payload.category_id ?? null,
          payload.account_id
        );
        close();
      },
      onError: async (err: unknown) => {
        if (err instanceof Response) {
          const apiError = await parseApiError(err);
          const errors = mapTagsToFieldErrors(apiError.tags, apiError.message);
          setFieldErrors(errors);
          if (errors._general) setSubmitError(errors._general);
        } else {
          setSubmitError("Erro ao salvar transação");
        }
      },
    });
  }

  return (
    <Drawer
      opened={opened}
      onClose={close}
      title={TYPE_LABELS[transactionType]}
      position="right"
      size="md"
    >
      <FormProvider {...methods}>
        <TransactionForm
          onTypeChange={setTransactionType}
          focusField="amount"
          onSubmitPayload={handleSubmitPayload}
          isPending={mutation.isPending}
          submitError={submitError}
          fieldErrors={fieldErrors}
        />
      </FormProvider>
    </Drawer>
  );
}
