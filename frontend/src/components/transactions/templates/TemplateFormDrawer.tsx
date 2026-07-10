import { Alert, Button, Group, Stack, TextInput } from "@mantine/core";
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

  const defaultValues: TemplateFormValues = template
    ? { ...buildTemplateFormPatch(template.payload, { accounts, categories, tags }), name: template.name }
    : EMPTY_DEFAULTS;

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues,
  });

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
  // 409 tags (cap reached / duplicate name) surface here via the API client's
  // `data.message ?? fallback` error parsing.
  const error = (createMutation.error ?? updateMutation.error)?.message;

  function onSubmit(values: TemplateFormValues) {
    const payload = buildTemplatePayloadFromForm(
      {
        transaction_type: values.transaction_type,
        description: values.description,
        account_id: values.account_id,
        category_id: values.category_id,
        destination_account_id: values.destination_account_id,
        tags: values.tags,
        split_settings: values.split_settings,
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

  return (
    <ResponsiveDrawer
      opened={opened}
      onClose={reject}
      title={template ? "Editar modelo" : "Novo modelo"}
      data-testid={TransactionsTestIds.TemplateFormDrawer}
    >
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <Stack gap="md">
            {error && (
              <Alert
                color="red"
                title="Erro"
                variant="light"
                data-testid={TransactionsTestIds.TemplateFormError}
              >
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
    </ResponsiveDrawer>
  );
}
