import { type FocusEvent, type ReactNode } from "react";
import { useFormContext, Controller, useWatch, FieldPath } from "react-hook-form";
import { useFocusFieldOnMount } from "@/hooks/useFocusFieldOnMount";
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
  Switch,
  ComboboxItemGroup,
  ComboboxItem,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useAccounts } from "@/hooks/useAccounts";
import { useFlattenCategories } from "@/hooks/useCategories";
import { useTags } from "@/hooks/useTags";
import { Transactions } from "@/types/transactions";
import { CurrencyInput } from "./CurrencyInput";
import { DescriptionAutocomplete } from "./DescriptionAutocomplete";
import { RecurrenceFields } from "./RecurrenceFields";
import { SplitSettingsFields } from "./SplitSettingsFields";
import { TransactionFormValues } from "./transactionFormSchema";
import { TransactionsTestIds } from "@/testIds";

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
  /** Extra content rendered between the form fields and the sticky submit button. */
  extraContent?: ReactNode;
  /** When true, disables the current installment input in RecurrenceFields. */
  isUpdate?: boolean;
}

export const TransactionForm = ({
  focusField,
  onSubmitPayload,
  onSaveAndCreateAnother,
  isPending,
  submitError,
  extraContent,
  isUpdate = false,
}: Props) => {
  const { query: accountsQuery } = useAccounts();
  const { query: categoriesQuery } = useFlattenCategories();
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

  useFocusFieldOnMount(setFocus, focusField);

  const transactionType = useWatch({ control, name: "transaction_type" });
  const recurrenceEnabled = useWatch({ control, name: "recurrenceEnabled" });
  const isTransfer = transactionType === "transfer";

  const generalError = submitError ?? (errors as Record<string, { message?: string }>)["_general"]?.message;

  const onSubmit = (values: TransactionFormValues) => {
    onSubmitPayload({ ...values, date: values.date });
  };

  function handleSuggestionSelect(suggestion: Transactions.TransactionSuggestion) {
    setValue("transaction_type", suggestion.type);
    setValue("amount", suggestion.amount);
    if (suggestion.account_id) setValue("account_id", suggestion.account_id);
    if (suggestion.category_id) setValue("category_id", suggestion.category_id);
    if (suggestion.tags)
      setValue(
        "tags",
        suggestion.tags.map((t) => t.name),
      );
    // Clear split settings on autocomplete to avoid stale data
    setValue("split_settings", []);
  }

  const accountOptions = accounts
    .filter((a) => !a.user_connection)
    .map((a) => ({ value: String(a.id), label: a.name }));

  const destinationAccountOptions: ComboboxItemGroup<ComboboxItem>[] = accounts.reduce<
    ComboboxItemGroup<ComboboxItem>[]
  >(
    (acc, a) => {
      const item = { label: a.name, value: String(a.id) };
      if (a.user_connection) {
        return [
          acc[0],
          {
            ...acc[1],
            items: [...acc[1].items, item],
          },
        ];
      }

      return [
        {
          ...acc[0],
          items: [...acc[0].items, item],
        },
        acc[1],
      ];
    },
    [
      {
        group: "Minhas contas",
        items: [],
      },
      {
        group: "Contas Compartilhadas",
        items: [],
      },
    ],
  );

  const categoryOptions = categories.map((c) => ({
    value: String(c.id),
    label: c.emoji ? `${c.emoji} ${c.name}` : c.name,
  }));

  const tagNames = existingTags.map((t) => t.name);

  function makeSelectBlurHandler(
    options: ComboboxItemGroup<ComboboxItem>[] | ComboboxItem[],
    onChange: (val: number | null) => void,
  ) {
    const isItemGroup = (o: ComboboxItem | ComboboxItemGroup<ComboboxItem>): o is ComboboxItemGroup<ComboboxItem> =>
      "group" in o;

    return (e: FocusEvent<HTMLInputElement>) => {
      const typed = e.target.value.trim().toLowerCase();
      if (!typed) return;
      const items: ComboboxItem[] = [];
      options.forEach((o) => {
        if (isItemGroup(o)) {
          items.push(...o.items);
        } else {
          items.push(o);
        }
      });
      const match = items.find((o) => o.label.toLowerCase() === typed);
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
                {
                  value: "expense",
                  label: (
                    <span data-testid={TransactionsTestIds.SegmentTransactionType("expense")}>
                      Despesa
                    </span>
                  ),
                },
                {
                  value: "income",
                  label: (
                    <span data-testid={TransactionsTestIds.SegmentTransactionType("income")}>
                      Receita
                    </span>
                  ),
                },
                {
                  value: "transfer",
                  label: (
                    <span data-testid={TransactionsTestIds.SegmentTransactionType("transfer")}>
                      Transferência
                    </span>
                  ),
                },
              ]}
              value={field.value}
              onChange={(val) => {
                field.onChange(val);
                if (val === "transfer") setValue("split_settings", []);
              }}
              fullWidth
              data-testid={TransactionsTestIds.SegmentedTransactionType}
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
                data-testid={TransactionsTestIds.InputAmount}
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
                  onBlur={makeSelectBlurHandler(accountOptions, (val) => field.onChange(val))}
                  error={errors.account_id?.message}
                  searchable
                  renderOption={({ option }) => (
                    <span data-testid={TransactionsTestIds.OptionAccount(option.value)}>
                      {option.label}
                    </span>
                  )}
                  data-testid={TransactionsTestIds.SelectAccount}
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
                  onBlur={makeSelectBlurHandler(destinationAccountOptions, (val) => field.onChange(val))}
                  error={errors.destination_account_id?.message}
                  searchable
                  renderOption={({ option }) => (
                    <span data-testid={TransactionsTestIds.OptionDestinationAccount(option.value)}>
                      {option.label}
                    </span>
                  )}
                  data-testid={TransactionsTestIds.SelectDestinationAccount}
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
                    onBlur={makeSelectBlurHandler(categoryOptions, (val) => field.onChange(val))}
                    error={errors.category_id?.message}
                    searchable
                    clearable
                    renderOption={({ option }) => (
                      <span data-testid={TransactionsTestIds.OptionCategory(option.value)}>
                        {option.label}
                      </span>
                    )}
                    data-testid={TransactionsTestIds.SelectCategory}
                  />
                )}
              />
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
                    onBlur={makeSelectBlurHandler(accountOptions, (val) => field.onChange(val))}
                    error={errors.account_id?.message}
                    searchable
                    renderOption={({ option }) => (
                      <span data-testid={TransactionsTestIds.OptionAccount(option.value)}>
                        {option.label}
                      </span>
                    )}
                    data-testid={TransactionsTestIds.SelectAccount}
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

        <Stack gap="xs">
          <Controller
            control={control}
            name="recurrenceEnabled"
            render={({ field }) => (
              <Switch
                label="Recorrência"
                checked={!!field.value}
                onChange={(e) => field.onChange(e.currentTarget.checked)}
              />
            )}
          />
          {recurrenceEnabled && <RecurrenceFields disableCurrentInstallment={isUpdate} />}
        </Stack>
      </Stack>

      {extraContent}

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
          <Button type="submit" loading={isSubmitting || isPending} data-testid={TransactionsTestIds.BtnSave}>
            Salvar
          </Button>
        </Group>
      </Box>
    </form>
  );
};
