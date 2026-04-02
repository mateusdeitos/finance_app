import { useEffect, type FocusEvent } from "react";
import {
  useFormContext,
  Controller,
  useWatch,
  FieldPath,
} from "react-hook-form";
import {
  Stack,
  SegmentedControl,
  Select,
  TagsInput,
  Button,
  Alert,
  Group,
  SimpleGrid,
  Box,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useTags } from "@/hooks/useTags";
import { Transactions } from "@/types/transactions";
import { CurrencyInput } from "./CurrencyInput";
import { DescriptionAutocomplete } from "./DescriptionAutocomplete";
import { RecurrenceFields } from "./RecurrenceFields";
import { SplitSettingsFields } from "./SplitSettingsFields";
import { TransactionFormValues } from "./transactionFormSchema";

export type { TransactionFormValues };

/** Which field to auto-focus after the form mounts. */
export type FocusField = FieldPath<TransactionFormValues>;

interface Props {
  /** Field to focus on mount. 'split_settings.0.amount' focuses the first split input. */
  focusField?: FocusField;
  onSubmitPayload: (values: TransactionFormValues) => void;
  onSaveAndCreateAnother?: (values: TransactionFormValues) => void;
  isPending?: boolean;
  submitError?: string;
}

export const TransactionForm = ({
  focusField,
  onSubmitPayload,
  onSaveAndCreateAnother,
  isPending,
  submitError,
}: Props) => {
  const { query: accountsQuery } = useAccounts();
  const { query: categoriesQuery } = useCategories();
  const { query: tagsQuery } = useTags();

  const accounts = accountsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const existingTags = tagsQuery.data ?? [];

  const {
    control,
    handleSubmit,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useFormContext<TransactionFormValues>();

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (focusField) {
        setFocus(focusField);
      }
    }, 0);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const transactionType = useWatch({ control, name: "transaction_type" });
  const isTransfer = transactionType === "transfer";

  const generalError =
    submitError ??
    (errors as Record<string, { message?: string }>)["_general"]?.message;

  const onSubmit = (values: TransactionFormValues) => {
    onSubmitPayload({ ...values, date: values.date });
  };

  function handleSuggestionSelect(
    suggestion: Transactions.TransactionSuggestion
  ) {
    setValue("transaction_type", suggestion.type);
    setValue("amount", suggestion.amount);
    if (suggestion.account_id) setValue("account_id", suggestion.account_id);
    if (suggestion.category_id) setValue("category_id", suggestion.category_id);
    if (suggestion.tags)
      setValue(
        "tags",
        suggestion.tags.map((t) => t.name)
      );
    // Clear split settings on autocomplete to avoid stale data
    setValue("split_settings", []);
  }

  const accountOptions = accounts
    .filter((a) => !a.user_connection)
    .map((a) => ({ value: String(a.id), label: a.name }));

  const destinationAccountOptions = [
    ...accounts
      .filter((a) => !a.user_connection)
      .map((a) => ({
        value: String(a.id),
        label: a.name,
        group: "Minhas contas",
      })),
    ...accounts
      .filter((a) => a.user_connection?.connection_status === "accepted")
      .map((a) => ({
        value: String(a.id),
        label: a.description || a.name,
        group: "Contas compartilhadas",
      })),
  ];

  const categoryOptions = categories
    .filter((c) => !c.parent_id)
    .map((c) => ({
      value: String(c.id),
      label: c.emoji ? `${c.emoji} ${c.name}` : c.name,
    }));

  const tagNames = existingTags.map((t) => t.name);

  function makeSelectBlurHandler(
    options: { value: string; label: string }[],
    onChange: (val: number | null) => void
  ) {
    return (e: FocusEvent<HTMLInputElement>) => {
      const typed = e.target.value.trim().toLowerCase();
      if (!typed) return;
      const match = options.find((o) => o.label.toLowerCase() === typed);
      if (match) onChange(Number(match.value));
    };
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack gap="md">
        {generalError && (
          <Alert color="red" title="Erro" variant="light">
            {generalError}
          </Alert>
        )}

        <Controller
          control={control}
          name="transaction_type"
          render={({ field }) => (
            <SegmentedControl
              data={[
                { value: "expense", label: "Despesa" },
                { value: "income", label: "Receita" },
                { value: "transfer", label: "Transferência" },
              ]}
              value={field.value}
              onChange={(val) => {
                field.onChange(val);
                if (val === "transfer") setValue("split_settings", []);
              }}
              fullWidth
              data-testid="segmented_transaction_type"
            />
          )}
        />

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Controller
            control={control}
            name="date"
            render={({ field }) => (
              <DatePickerInput
                ref={field.ref}
                label="Data"
                required
                value={new Date(field.value)}
                onChange={(date) => field.onChange(date)}
                error={errors.date?.message}
                valueFormat="DD/MM/YYYY"
              />
            )}
          />

          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <CurrencyInput
                ref={field.ref}
                label="Valor (R$)"
                required
                value={field.value}
                onChange={field.onChange}
                error={errors.amount?.message}
                data-testid="input_amount"
              />
            )}
          />
        </SimpleGrid>

        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <DescriptionAutocomplete
              ref={field.ref}
              value={field.value}
              onChange={field.onChange}
              onSuggestionSelect={handleSuggestionSelect}
              error={errors.description?.message}
              required
            />
          )}
        />

        {isTransfer ? (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Controller
              control={control}
              name="account_id"
              render={({ field }) => (
                <Select
                  ref={field.ref}
                  label="Conta"
                  required
                  data={accountOptions}
                  value={field.value ? String(field.value) : null}
                  onChange={(val) => field.onChange(val ? Number(val) : null)}
                  onBlur={makeSelectBlurHandler(accountOptions, (val) =>
                    field.onChange(val)
                  )}
                  error={errors.account_id?.message}
                  searchable
                  data-testid="select_account"
                />
              )}
            />
            <Controller
              control={control}
              name="destination_account_id"
              render={({ field }) => (
                <Select
                  ref={field.ref}
                  label="Conta de destino"
                  required
                  data={destinationAccountOptions}
                  value={field.value ? String(field.value) : null}
                  onChange={(val) => field.onChange(val ? Number(val) : null)}
                  onBlur={makeSelectBlurHandler(
                    destinationAccountOptions,
                    (val) => field.onChange(val)
                  )}
                  error={errors.destination_account_id?.message}
                  searchable
                />
              )}
            />
          </SimpleGrid>
        ) : (
          <>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Controller
                control={control}
                name="category_id"
                render={({ field }) => (
                  <Select
                    ref={field.ref}
                    label="Categoria"
                    data={categoryOptions}
                    value={field.value ? String(field.value) : null}
                    onChange={(val) => field.onChange(val ? Number(val) : null)}
                    onBlur={makeSelectBlurHandler(categoryOptions, (val) =>
                      field.onChange(val)
                    )}
                    error={errors.category_id?.message}
                    searchable
                    clearable
                    data-testid="select_category"
                  />
                )}
              />
              <Controller
                control={control}
                name="account_id"
                render={({ field }) => (
                  <Select
                    label="Conta"
                    required
                    data={accountOptions}
                    value={field.value ? String(field.value) : null}
                    onChange={(val) => field.onChange(val ? Number(val) : null)}
                    onBlur={makeSelectBlurHandler(accountOptions, (val) =>
                      field.onChange(val)
                    )}
                    error={errors.account_id?.message}
                    searchable
                    data-testid="select_account"
                  />
                )}
              />
            </SimpleGrid>

            <SplitSettingsFields />
          </>
        )}

        <Controller
          control={control}
          name="tags"
          render={({ field }) => (
            <TagsInput
              label="Tags"
              placeholder="Adicionar tag"
              data={tagNames}
              value={field.value}
              onChange={field.onChange}
              error={errors.tags?.message}
              clearable
            />
          )}
        />

        <RecurrenceFields />
      </Stack>

      <Box
        style={{
          position: "sticky",
          bottom: 0,
          background: "var(--mantine-color-body)",
          borderTop: "1px solid var(--mantine-color-default-border)",
          paddingTop: "var(--mantine-spacing-md)",
          paddingBottom: "var(--mantine-spacing-md)",
          marginTop: "var(--mantine-spacing-md)",
        }}
      >
        <Group justify="flex-end">
          {onSaveAndCreateAnother && (
            <Button
              variant="default"
              type="button"
              loading={isSubmitting || isPending}
              onClick={handleSubmit(onSaveAndCreateAnother)}
            >
              Salvar e criar outra
            </Button>
          )}
          <Button
            type="submit"
            loading={isSubmitting || isPending}
            data-testid="btn_save_transaction"
          >
            Salvar
          </Button>
        </Group>
      </Box>
    </form>
  );
};
