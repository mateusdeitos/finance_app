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
  Alert,
  SimpleGrid,
  Group,
  ComboboxItemGroup,
  ComboboxItem,
} from "@mantine/core";
import { IconTrendingDown, IconTrendingUp, IconArrowRight } from "@tabler/icons-react";
import { DatePickerInput } from "@mantine/dates";
import { useAccounts } from "@/hooks/useAccounts";
import { useGroupedAccountOptions } from "@/hooks/useGroupedAccountOptions";
import { useFlattenCategories } from "@/hooks/useCategories";
import { Transactions } from "@/types/transactions";
import { CurrencyInput } from "./CurrencyInput";
import { DescriptionAutocomplete } from "./DescriptionAutocomplete";
import { TransactionAccordionSections } from "./TransactionAccordionSections";
import { DateQuickChips } from "./DateQuickChips";
import { TransactionFormFooter } from "./TransactionFormFooter";
import { TransactionFormValues } from "./transactionFormSchema";
import { TransactionsTestIds, type TransactionExtraPanel, type TransactionType } from "@/testIds";

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

/** Mantine color associated with each transaction type — drives the segmented indicator. */
const TYPE_COLOR: Record<TransactionType, string> = {
  expense: "red",
  income: "teal",
  transfer: "blue",
};

const TYPE_ICON: Record<TransactionType, ReactNode> = {
  expense: <IconTrendingDown size={14} />,
  income: <IconTrendingUp size={14} />,
  transfer: <IconArrowRight size={14} />,
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
    setError,
    clearErrors,
    setFocus,
    getValues,
    formState: { errors, isSubmitting, dirtyFields },
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

  const [activePanel, setActivePanel] = useState<TransactionExtraPanel | null>(() => {
    const values = getValues();
    if (values.recurrenceEnabled) return "recurrence";
    if ((values.split_settings?.length ?? 0) > 0) return "split";
    if ((values.tags?.length ?? 0) > 0) return "tags";
    return null;
  });

  /** On invalid submit, jump to the first panel holding an error so it isn't hidden. */
  const onInvalid = (formErrors: FieldErrors<TransactionFormValues>) => {
    // Surface a generic top-level alert so users (and e2e tests) see that
    // submission failed even when every individual error sits inside a
    // collapsed accordion. Field errors stay visible inline.
    if (Object.keys(formErrors).length > 0) {
      setError("_general" as keyof TransactionFormValues, {
        type: "validation",
        message: "Verifique os campos destacados no formulário",
      });
    }
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
    clearErrors("_general" as keyof TransactionFormValues);
    onSubmitPayload({ ...values, date: values.date });
  };

  function handleSuggestionSelect(suggestion: Transactions.TransactionSuggestion) {
    // Only fill fields the user hasn't manually edited, so a suggestion never
    // overwrites a value the user already set on purpose.
    if (!dirtyFields.transaction_type) setValue("transaction_type", suggestion.type);
    if (!dirtyFields.amount) setValue("amount", suggestion.amount);
    if (!dirtyFields.account_id && suggestion.account_id) setValue("account_id", suggestion.account_id);
    if (!dirtyFields.category_id && suggestion.category_id) setValue("category_id", suggestion.category_id);
    if (!dirtyFields.tags && suggestion.tags)
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

  const submit = handleSubmit(onSubmit, onInvalid);

  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  }

  const typeColor = TYPE_COLOR[transactionType];

  return (
    <form onSubmit={submit} onKeyDown={handleFormKeyDown} noValidate>
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
              color={typeColor}
              data={(["expense", "income", "transfer"] as const).map((t) => ({
                value: t,
                label: (
                  <Group gap={6} wrap="nowrap" justify="center">
                    {TYPE_ICON[t]}
                    <span data-testid={TransactionsTestIds.SegmentTransactionType(t)}>
                      {t === "expense" ? "Despesa" : t === "income" ? "Receita" : "Transferência"}
                    </span>
                  </Group>
                ),
              }))}
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

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Controller
            control={control}
            name="date"
            render={({ field }) => (
              <div>
                <DatePickerInput
                  ref={field.ref}
                  label="Data"
                  required
                  value={field.value || null}
                  onChange={(date) => field.onChange(date ?? "")}
                  error={errors.date?.message}
                  valueFormat="DD/MM/YYYY"
                />
                <DateQuickChips value={field.value} onChange={field.onChange} />
              </div>
            )}
          />

          {isTransfer ? (
            <Controller
              key="account-personal"
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
          ) : (
            <Controller
              key="account-grouped"
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
          )}
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
          <Controller
            key="destination-account"
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
        ) : (
          <Controller
            key="category"
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
        )}

        <TransactionAccordionSections
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          splitApplicable={splitApplicable}
          isUpdate={isUpdate}
        />
      </Stack>

      {extraContent}

      <TransactionFormFooter
        loading={isSubmitting || !!isPending}
        onSaveAndCreateAnother={
          onSaveAndCreateAnother ? handleSubmit(onSaveAndCreateAnother, onInvalid) : undefined
        }
      />
      <Suspense>
        <DevTool control={control} />
      </Suspense>
    </form>
  );
};
