import { useState } from "react";
import { useForm, FormProvider, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Divider, Drawer, Stack } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateTransaction } from "@/hooks/useUpdateTransaction";
import { useAccounts } from "@/hooks/useAccounts";
import { useTags } from "@/hooks/useTags";
import { Transactions } from "@/types/transactions";
import { QueryKeys } from "@/utils/queryKeys";
import { useDrawerContext } from "@/utils/renderDrawer";
import { buildTransactionPayload } from "@/utils/buildTransactionPayload";
import {
  updateTransactionFormSchema,
  UpdateTransactionFormValues,
  TransactionFormValues,
} from "./form/transactionFormSchema";
import { TransactionForm, FocusField } from "./form/TransactionForm";
import { UpdatePropagationSelector } from "./UpdatePropagationSelector";
import { convertUtcToLocalKeepingValues } from "@/utils/parseDate";
import { TransactionsTestIds } from "@/testIds";

interface Props {
  transaction: Transactions.Transaction;
  focusField?: FocusField;
}

export function UpdateTransactionDrawer({ transaction, focusField }: Props) {
  const { opened, close } = useDrawerContext<void>();
  const [submitError, setSubmitError] = useState<string | undefined>();

  const { query: accountsQuery } = useAccounts();
  const accounts = accountsQuery.data ?? [];

  const { query: tagsQuery } = useTags();
  const existingTags = tagsQuery.data ?? [];

  const initialSplitSettings = (transaction.linked_transactions ?? [])
    .filter((lt) => lt.user_id !== transaction.user_id)
    .flatMap((lt) => {
      const acc = accounts.find(
        (a) =>
          a.user_connection?.from_account_id === lt.account_id || a.user_connection?.to_account_id === lt.account_id,
      );
      if (!acc?.user_connection) return [];
      return [{ connection_id: acc.user_connection.id, amount: lt.amount }];
    });

  const {
    query: { data: destinationAccount },
  } = useAccounts((accounts) => {
    if (transaction.type !== "transfer") return null;
    return accounts.find((a) => {
      const ids = [a.id];
      if (a.user_connection) {
        ids.push(a.user_connection?.from_account_id, a.user_connection?.to_account_id);
      }

      return ids.includes(transaction.linked_transactions![0].account_id);
    });
  });

  const isRecurring = transaction.transaction_recurrence_id != null;

  const methods = useForm<UpdateTransactionFormValues>({
    resolver: zodResolver(updateTransactionFormSchema),
    defaultValues: {
      transaction_type: transaction.type,
      date: convertUtcToLocalKeepingValues(transaction.date),
      description: transaction.description,
      amount: transaction.amount,
      account_id: transaction.account_id,
      category_id: transaction.category_id ?? null,
      destination_account_id: destinationAccount?.id ?? null,
      tags: (transaction.tags ?? []).map((t) => t.name),
      split_settings: initialSplitSettings,
      recurrenceEnabled: !!transaction.transaction_recurrence?.id,
      recurrenceType: transaction.transaction_recurrence?.type ?? "monthly",
      recurrenceCurrentInstallment: transaction.installment_number ?? null,
      recurrenceTotalInstallments: transaction.transaction_recurrence?.installments ?? null,
      propagation_settings: "current",
    },
  });

  const queryClient = useQueryClient();
  const { mutation } = useUpdateTransaction();

  function submitTransaction(values: UpdateTransactionFormValues, onSuccess: () => void) {
    setSubmitError(undefined);
    const payload = buildTransactionPayload(values, existingTags);

    mutation.mutate(
      {
        id: transaction.id,
        payload: {
          ...payload,
          propagation_settings: isRecurring ? values.propagation_settings : undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [QueryKeys.Transactions] });
          onSuccess();
        },
        onError: () => {
          setSubmitError("Erro ao salvar transação");
        },
      },
    );
  }

  function handleSubmitPayload(values: UpdateTransactionFormValues) {
    submitTransaction(values, close);
  }

  function handleSaveAndCreateAnother(values: UpdateTransactionFormValues) {
    submitTransaction(values, () => methods.reset());
  }

  return (
    <Drawer
      opened={opened}
      onClose={close}
      title="Editar transação"
      position="right"
      size="md"
      data-testid={TransactionsTestIds.DrawerUpdate}
    >
      <FormProvider {...methods}>
        <TransactionForm
          focusField={focusField}
          onSubmitPayload={handleSubmitPayload as (values: TransactionFormValues) => void}
          onSaveAndCreateAnother={handleSaveAndCreateAnother as (values: TransactionFormValues) => void}
          isPending={mutation.isPending}
          submitError={submitError}
          isUpdate={isRecurring}
          extraContent={
            isRecurring ? (
              <Stack gap="md">
                <Divider />
                <Controller
                  control={methods.control}
                  name="propagation_settings"
                  render={({ field }) => <UpdatePropagationSelector value={field.value} onChange={field.onChange} />}
                />
              </Stack>
            ) : undefined
          }
        />
      </FormProvider>
    </Drawer>
  );
}
