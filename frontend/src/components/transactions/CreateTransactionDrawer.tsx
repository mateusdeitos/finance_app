import { useId, useState } from "react";
import { useForm, FormProvider, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ResponsiveDrawer } from "@/components/ResponsiveDrawer";
import { useQueryClient } from "@tanstack/react-query";
import { useCategories } from "@/hooks/useCategories";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useMe } from "@/hooks/useMe";
import { useTransactionPrefill } from "@/hooks/useTransactionPrefill";
import { useCreateTransaction } from "@/hooks/useCreateTransaction";
import { useAccounts } from "@/hooks/useAccounts";
import { useTags } from "@/hooks/useTags";
import { Transactions } from "@/types/transactions";
import { buildTransactionPayload } from "@/utils/buildTransactionPayload";
import { parseApiError, mapTagsToFieldErrors } from "@/utils/apiErrors";
import { QueryKeys } from "@/utils/queryKeys";
import { useDrawerContext } from "@/utils/renderDrawer";
import { transactionFormSchema, TransactionFormValues } from "./form/transactionFormSchema";
import { TransactionForm } from "./form/TransactionForm";
import { MobileFormHeader } from "./form/MobileFormHeader";
import { parseDate, localDateStr } from "@/utils/parseDate";
import { TransactionsTestIds } from '@/testIds'

const TYPE_LABELS: Record<Transactions.TransactionType, string> = {
  expense: "Nova Despesa",
  income: "Nova Receita",
  transfer: "Nova Transferência",
};

export function CreateTransactionDrawer() {
  const { opened, close } = useDrawerContext<void>();
  const [submitError, setSubmitError] = useState<string | undefined>();
  const isMobile = useIsMobile();
  const formId = useId();

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
      date: prefill.date ? localDateStr(parseDate(prefill.date)) : localDateStr(new Date()),
      description: "",
      amount: 0,
      account_id: prefill.accountId ?? undefined,
      category_id: prefill.categoryId ?? null,
      destination_account_id: null,
      tags: [],
      split_settings: [],
      recurrenceEnabled: false,
      recurrenceType: "monthly",
      recurrenceCurrentInstallment: null,
      recurrenceTotalInstallments: null,
    },
  });

  const transactionType = useWatch({ control: methods.control, name: "transaction_type" });

  const { query: tagsQuery } = useTags();
  const existingTags = tagsQuery.data ?? [];

  const queryClient = useQueryClient();
  const { mutation } = useCreateTransaction({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Transactions] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Tags] });
    },
  });

  function submitTransaction(values: TransactionFormValues, onSuccess: () => void) {
    setSubmitError(undefined);
    const payload = buildTransactionPayload(values, existingTags);
    mutation.mutate(payload, {
      onSuccess: () => {
        savePrefill(payload.date, payload.category_id ?? null, payload.account_id ?? null);
        onSuccess();
      },
      onError: async (err: unknown) => {
        if (err instanceof Response) {
          const apiError = await parseApiError(err);
          const errors = mapTagsToFieldErrors(apiError.tags, apiError.message);
          for (const [field, message] of Object.entries(errors)) {
            if (field === "_general") {
              setSubmitError(message);
            } else {
              methods.setError(field as keyof TransactionFormValues, { message });
            }
          }
        } else {
          setSubmitError("Erro ao salvar transação");
        }
      },
    });
  }

  function handleSubmitPayload(values: TransactionFormValues) {
    submitTransaction(values, close);
  }

  function handleSaveAndCreateAnother(values: TransactionFormValues) {
    submitTransaction(values, () => methods.reset());
  }

  return (
    <ResponsiveDrawer
      opened={opened}
      onClose={close}
      title={
        isMobile ? (
          <MobileFormHeader
            title={TYPE_LABELS[transactionType]}
            onCancel={close}
            formId={formId}
            loading={mutation.isPending}
          />
        ) : (
          TYPE_LABELS[transactionType]
        )
      }
      withCloseButton={!isMobile}
      size="lg"
      // On mobile the header bar (MobileFormHeader) must span the full width so
      // "Salvar" sits flush right; Mantine's Drawer.Title otherwise shrinks to
      // its content. flex:1 lets it fill the header row.
      styles={isMobile ? { title: { flex: 1 } } : undefined}
      data-testid={TransactionsTestIds.DrawerCreate}
    >
      <FormProvider {...methods}>
        <TransactionForm
          focusField="amount"
          formId={formId}
          onSubmitPayload={handleSubmitPayload}
          onSaveAndCreateAnother={handleSaveAndCreateAnother}
          isPending={mutation.isPending}
          submitError={submitError}
          showTemplateChips
        />
      </FormProvider>
    </ResponsiveDrawer>
  );
}
