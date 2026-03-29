import { useState } from "react";
import { Drawer } from "@mantine/core";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useMe } from "@/hooks/useMe";
import { useTransactionPrefill } from "@/hooks/useTransactionPrefill";
import { useCreateTransaction } from "@/hooks/useCreateTransaction";
import { Transactions } from "@/types/transactions";
import { parseApiError, mapTagsToFieldErrors } from "@/utils/apiErrors";
import { useDrawerContext } from "@/utils/renderDrawer";
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

  const { mutation } = useCreateTransaction();

  const initialValues: Record<string, unknown> = {};
  if (prefill.date) initialValues.date = prefill.date;
  if (prefill.accountId) initialValues.account_id = prefill.accountId;
  if (prefill.categoryId) initialValues.category_id = prefill.categoryId;

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
      <TransactionForm
        currentUserId={currentUserId}
        initialValues={initialValues}
        onSuccess={close}
        onSavePrefill={() => {}}
        onTypeChange={setTransactionType}
        focusField="amount"
        onSubmitPayload={handleSubmitPayload}
        isPending={mutation.isPending}
        submitError={submitError}
        fieldErrors={fieldErrors}
      />
    </Drawer>
  );
}
