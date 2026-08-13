import { Alert, Button, Group, Loader, Stack, TextInput } from "@mantine/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormProvider, useForm } from "react-hook-form";
import { ResponsiveDrawer } from "@/components/ResponsiveDrawer";
import { useDrawerContext } from "@/utils/renderDrawer";
import { useAccounts } from "@/hooks/useAccounts";
import { useFlattenCategories } from "@/hooks/useCategories";
import { useTags } from "@/hooks/useTags";
import {
  useCreateTransactionTemplate,
  useTransactionTemplates,
  useUpdateTransactionTemplate,
} from "@/hooks/useTransactionTemplates";
import { buildTemplateFormPatch } from "@/components/transactions/form/applyTemplate";
import { buildTemplatePayloadFromForm } from "@/components/transactions/form/buildTemplatePayload";
import { Transactions } from "@/types/transactions";
import { TransactionsTestIds } from "@/testIds";
import { TemplateFormFields } from "./TemplateFormFields";
import { templateFormSchema, type TemplateFormValues } from "./templateFormSchema";

interface Props {
  /** Present = edit an existing template; absent = create. */
  template?: Transactions.Template;
}

const EMPTY_DEFAULTS: TemplateFormValues = {
  name: "",
  transaction_type: "expense",
  description: "",
  account_id: 0,
  category_id: null,
  destination_account_id: null,
  tags: [],
  split_settings: [],
};

export function TemplateFormDrawer({ template }: Props) {
  const { opened, close, reject } = useDrawerContext<Transactions.Template | void>();
  const { invalidate } = useTransactionTemplates();
  const { query: accountsQuery } = useAccounts();
  const { query: categoriesQuery } = useFlattenCategories();
  const { query: tagsQuery } = useTags();
  const accounts = accountsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const tags = tagsQuery.data ?? [];

  const { mutation: createMutation } = useCreateTransactionTemplate({
    onSuccess: async (created) => {
      await invalidate();
      close(created);
    },
  });
  const { mutation: updateMutation } = useUpdateTransactionTemplate({
    onSuccess: async () => {
      await invalidate();
      close();
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;
  // API validation errors (including duplicate names) surface here via the
  // client's `data.message ?? fallback` error parsing.
  const error = (createMutation.error ?? updateMutation.error)?.message;

  function onSubmit(values: TemplateFormValues) {
    const selectedAccount = accounts.find((account) => account.id === values.account_id);
    const payload = buildTemplatePayloadFromForm(
      {
        transaction_type: values.transaction_type,
        description: values.description,
        account_id: values.account_id,
        category_id: values.category_id,
        destination_account_id: values.destination_account_id,
        tags: values.tags,
        // Shared accounts cannot have splits on a concrete transaction. Strip
        // stale legacy rows on save as a final guard in addition to hiding the
        // split editor when a shared account is selected.
        split_settings: selectedAccount?.user_connection ? [] : values.split_settings,
        // Templates carry no amount/date/recurrence — filled with neutral
        // values so the object satisfies `TransactionFormValues`, the type
        // `buildTemplatePayloadFromForm` expects. None of these fields are
        // read by the builder.
        amount: 0,
        date: "",
        recurrenceEnabled: false,
        recurrenceType: null,
        recurrenceCurrentInstallment: null,
        recurrenceTotalInstallments: null,
      },
      tags,
    );
    const body = { name: values.name, payload };
    if (template) {
      updateMutation.mutate({ id: template.id, body });
    } else {
      createMutation.mutate(body);
    }
  }

  const referencesReady = accountsQuery.isSuccess && categoriesQuery.isSuccess && tagsQuery.isSuccess;

  return (
    <ResponsiveDrawer
      opened={opened}
      onClose={reject}
      title={template ? "Editar modelo" : "Novo modelo"}
      data-testid={TransactionsTestIds.TemplateFormDrawer}
    >
      {referencesReady ? (
        <TemplateFormContent
          template={template}
          accounts={accounts}
          categories={categories}
          tags={tags}
          error={error}
          isPending={isPending}
          onSubmit={onSubmit}
        />
      ) : (
        <Stack align="center" py="xl">
          <Loader size="sm" />
        </Stack>
      )}
    </ResponsiveDrawer>
  );
}

interface TemplateFormContentProps {
  template?: Transactions.Template;
  accounts: Transactions.Account[];
  categories: Transactions.Category[];
  tags: Transactions.Tag[];
  error?: string;
  isPending: boolean;
  onSubmit: (values: TemplateFormValues) => void;
}

/** Mount only after reference queries resolve so edit defaults cannot be built
 * from an empty cache and then silently overwrite category/tag/account ids. */
function TemplateFormContent({
  template,
  accounts,
  categories,
  tags,
  error,
  isPending,
  onSubmit,
}: TemplateFormContentProps) {
  const defaultValues: TemplateFormValues = template
    ? { ...buildTemplateFormPatch(template.payload, { accounts, categories, tags }), name: template.name }
    : EMPTY_DEFAULTS;
  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues,
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <Stack gap="md">
          {error && (
            <Alert color="red" title="Erro" variant="light" data-testid={TransactionsTestIds.TemplateFormError}>
              {error}
            </Alert>
          )}

          <TextInput
            label="Nome do modelo"
            required
            {...form.register("name")}
            error={form.formState.errors.name?.message}
            data-testid={TransactionsTestIds.TemplateInputName}
          />

          <TemplateFormFields />

          <Group justify="flex-end" mt="sm">
            <Button type="submit" loading={isPending} data-testid={TransactionsTestIds.TemplateBtnSave}>
              Salvar
            </Button>
          </Group>
        </Stack>
      </form>
    </FormProvider>
  );
}
