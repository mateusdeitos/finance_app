import { lazy, Suspense, type ComponentType, type FocusEvent, type ReactNode, useState } from "react";
import {
  useFormContext,
  Controller,
  useWatch,
  FieldPath,
  type Control,
  type FieldErrors,
} from "react-hook-form";
import { useFocusFieldOnMount } from "@/hooks/useFocusFieldOnMount";
import {
  Stack,
  SegmentedControl,
  Select,
  Button,
  Alert,
  Group,
  SimpleGrid,
  Box,
  ComboboxItemGroup,
  ComboboxItem,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useAccounts } from "@/hooks/useAccounts";
import { useGroupedAccountOptions } from "@/hooks/useGroupedAccountOptions";
import { useFlattenCategories } from "@/hooks/useCategories";
import { Transactions } from "@/types/transactions";
import { CurrencyInput } from "./CurrencyInput";
import { DescriptionAutocomplete } from "./DescriptionAutocomplete";
import { TransactionExtraSections } from "./TransactionExtraSections";
import { TransactionFormValues } from "./transactionFormSchema";
import { TransactionsTestIds, type TransactionExtraPanel } from "@/testIds";

// React Hook Form DevTool — dev-only; lazy-loaded so it is excluded from the
// production bundle. The cast restores the generic prop type that `lazy` erases.
type DevToolComponent = ComponentType<{ control: Control<TransactionFormValues> }>;

const DevTool: DevToolComponent = import.meta.env.PROD
  ? () => null
  : lazy(() =>
      import("@hookform/devtools").then((m) => ({
        default: m.DevTool as unknown as DevToolComponent,
      })),
    );

export type { TransactionFormValues };

/** Which field to auto-focus after the form mounts. */
export type FocusField = FieldPath<TransactionFormValues>;

/** Form fields owned by each extra-section panel — used to surface hidden errors. */
const PANEL_ERROR_FIELDS: Record<TransactionExtraPanel, (keyof TransactionFormValues)[]> = {
  recurrence: ["recurrenceType", "recurrenceCurrentInstallment", "recurrenceTotalInstallments"],
  split: ["split_settings"],
  tags: ["tags"],
};

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

  const accounts = accountsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  const {
    control,
    handleSubmit,
    setValue,
    setFocus,
    getValues,
    formState: { errors, isSubmitting },
  } = useFormContext<TransactionFormValues>();

  useFocusFieldOnMount(setFocus, focusField);

  const transactionType = useWatch({ control, name: "transaction_type" });
  const accountId = useWatch({ control, name: "account_id" });
  const isTransfer = transactionType === "transfer";
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const isSharedAccount = !!selectedAccount?.user_connection;
  const hasConnectedAccounts = accounts.some(
    (a) => a.user_connection && a.user_connection.connection_status === "accepted",
  );
  const splitApplicable = !isTransfer && !isSharedAccount && hasConnectedAccounts;

  const [activePanel, setActivePanel] = useState<TransactionExtraPanel>(() => {
    const values = getValues();
    if (values.recurrenceEnabled) return "recurrence";
    if ((values.split_settings?.length ?? 0) > 0) return "split";
    if ((values.tags?.length ?? 0) > 0) return "tags";
    return "recurrence";
  });

  /** On invalid submit, jump to the first panel holding an error so it isn't hidden. */
  const onInvalid = (formErrors: FieldErrors<TransactionFormValues>) => {
    const order: TransactionExtraPanel[] = ["recurrence", "split", "tags"];
    for (const panel of order) {
      if (panel === "split" && !splitApplicable) continue;
      if (PANEL_ERROR_FIELDS[panel].some((f) => formErrors[f])) {
        setActivePanel(panel);
        return;
      }
    }
  };

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

  // Transfer source: personal accounts only (flat list)
  const personalAccountOptions = accounts
    .filter((a) => !a.user_connection)
    .map((a) => ({ value: String(a.id), label: a.name }));

  // Expense/income + transfer destination: grouped personal + shared
  const groupedAccountOptions = useGroupedAccountOptions(accounts);

  const categoryOptions = categories.map((c) => ({
    value: String(c.id),
    label: c.emoji ? `${c.emoji} ${c.name}` : c.name,
  }));

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
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate>
      <Stack gap="md">
        {generalError && (
          <Alert color="red" title="Erro" variant="light" data-testid={TransactionsTestIds.AlertFormError}>
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
                value={field.value || null}
                onChange={(date) => field.onChange(date ?? "")}
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
                withCalculator
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
                  data={personalAccountOptions}
                  value={field.value ? String(field.value) : null}
                  onChange={(val) => field.onChange(val ? Number(val) : null)}
                  onBlur={makeSelectBlurHandler(personalAccountOptions, (val) => field.onChange(val))}
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
                  data={groupedAccountOptions}
                  value={field.value ? String(field.value) : null}
                  onChange={(val) => field.onChange(val ? Number(val) : null)}
                  onBlur={makeSelectBlurHandler(groupedAccountOptions, (val) => field.onChange(val))}
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
                    data={groupedAccountOptions}
                    value={field.value ? String(field.value) : null}
                    onChange={(val) => {
                      field.onChange(val ? Number(val) : null);
                      // Clear split settings when selecting a shared account
                      const acct = accounts.find((a) => a.id === Number(val));
                      if (acct?.user_connection) {
                        setValue("split_settings", []);
                      }
                    }}
                    onBlur={makeSelectBlurHandler(groupedAccountOptions, (val) => field.onChange(val))}
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
          </>
        )}

        <TransactionExtraSections
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          splitApplicable={splitApplicable}
          isUpdate={isUpdate}
        />
      </Stack>

      {extraContent}

      <Box
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 3,
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
              onClick={handleSubmit(onSaveAndCreateAnother, onInvalid)}
            >
              Salvar e criar outra
            </Button>
          )}
          <Button type="submit" loading={isSubmitting || isPending} data-testid={TransactionsTestIds.BtnSave}>
            Salvar
          </Button>
        </Group>
      </Box>
      <Suspense>
        <DevTool control={control} />
      </Suspense>
    </form>
  );
};
