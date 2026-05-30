import { lazy, Suspense, type ComponentType, type FocusEvent, type ReactNode, useId } from "react";
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
  Badge,
  SimpleGrid,
  Group,
  Text,
  TextInput,
  ComboboxItemGroup,
  ComboboxItem,
} from "@mantine/core";
import { IconTrendingDown, IconTrendingUp, IconArrowRight } from "@tabler/icons-react";
import { DatePickerInput } from "@mantine/dates";
import { AccountAvatar } from "@/components/AccountAvatar";
import { useAccounts } from "@/hooks/useAccounts";
import { useGroupedAccountOptions } from "@/hooks/useGroupedAccountOptions";
import { useFlattenCategories } from "@/hooks/useCategories";
import { Transactions } from "@/types/transactions";
import { CurrencyInput } from "./CurrencyInput";
import { DescriptionAutocomplete } from "./DescriptionAutocomplete";
import { TransactionAccordionSections } from "./TransactionAccordionSections";
import { DateQuickChips } from "./DateQuickChips";
import { TransactionFormFooter } from "./TransactionFormFooter";
import { ReadOnlyAccountField } from "./ReadOnlyAccountField";
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

/** Renders an account Select option with avatar + name + shared badge. */
function renderAccountOption(
  accounts: Transactions.Account[],
  testIdFor: (id: string) => string,
) {
  const Component = ({ option }: { option: ComboboxItem }) => {
    const acc = accounts.find((a) => String(a.id) === option.value);
    return (
      <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }} data-testid={testIdFor(option.value)}>
        <AccountAvatar account={acc} size={22} />
        <Text size="sm" style={{ flex: 1, minWidth: 0 }} truncate>
          {acc?.name ?? option.label}
        </Text>
        {acc?.user_connection && (
          <Badge size="xs" color="grape" variant="light">
            Compartilhada
          </Badge>
        )}
      </Group>
    );
  };
  return Component;
}

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

const TYPE_LABEL: Record<TransactionType, string> = {
  expense: "Despesa",
  income: "Receita",
  transfer: "Transferência",
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
  /** Content rendered at the very top of the form (e.g. an info alert). */
  headerContent?: ReactNode;
  /** When true, disables the current installment input in RecurrenceFields. */
  isUpdate?: boolean;
  /**
   * Stable id applied to the `<form>` element. Lets buttons outside the form
   * (e.g. the mobile drawer header's Salvar) submit it via `form={...}`.
   */
  formId?: string;
  /**
   * When provided, the source-account Select is replaced with a read-only
   * display of the partner's avatar + name. Used in the Update flow when
   * the transaction's account belongs to another user (e.g. the credit side
   * of a cross-user transfer created from a charge acceptance).
   */
  lockedSourceAccount?: LockedAccountInfo;
  /** Same as `lockedSourceAccount`, applied to `destination_account_id`. */
  lockedDestinationAccount?: LockedAccountInfo;
  /**
   * Renders the transaction-type control as read-only (disabled). Used for
   * charge-generated transfers, whose type is structurally bound to the charge.
   */
  lockTransactionType?: boolean;
  /** Hides the recurrence section entirely (e.g. charge-generated transfers). */
  hideRecurrence?: boolean;
}

export interface LockedAccountInfo {
  avatarUrl?: string;
  name: string;
  description?: string;
}

export const TransactionForm = ({
  focusField,
  onSubmitPayload,
  onSaveAndCreateAnother,
  isPending,
  submitError,
  extraContent,
  headerContent,
  isUpdate = false,
  formId,
  lockedSourceAccount,
  lockedDestinationAccount,
  lockTransactionType = false,
  hideRecurrence = false,
}: Props) => {
  const fallbackId = useId();
  const resolvedFormId = formId ?? fallbackId;
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

  // Panels we want the Accordion to seed open. The Accordion is uncontrolled
  // (multiple mode) — this value is only read on its first mount as the
  // `defaultValue`. Any panel whose fields hold a validation error is added
  // so it stays visible after a failed submit.
  const panelsWithErrors: TransactionExtraPanel[] = (
    ["recurrence", "split", "tags"] as const
  ).filter(
    (panel) =>
      !(panel === "split" && !splitApplicable) &&
      PANEL_ERROR_FIELDS[panel].some((f) => errors[f]),
  );

  /** On invalid submit, surface a generic top-level alert. Field errors stay
   *  visible inline; their parent accordion was either already open or will
   *  remount with the panel in the `forceOpen` set on the next render. */
  const onInvalid = (formErrors: FieldErrors<TransactionFormValues>) => {
    if (Object.keys(formErrors).length > 0) {
      setError("_general" as keyof TransactionFormValues, {
        type: "validation",
        message: "Verifique os campos destacados no formulário",
      });
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
    <form id={resolvedFormId} onSubmit={submit} onKeyDown={handleFormKeyDown} noValidate>
      <Stack gap="md">
        {headerContent}
        {generalError && (
          <Alert color="red" title="Erro" variant="light" data-testid={TransactionsTestIds.AlertFormError}>
            {generalError}
          </Alert>
        )}

        <Controller
          control={control}
          name="transaction_type"
          render={({ field }) =>
            lockTransactionType ? (
              <TextInput
                label="Tipo"
                value={TYPE_LABEL[field.value]}
                disabled
                readOnly
                data-testid={TransactionsTestIds.InputTransactionType}
              />
            ) : (
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
            )
          }
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

          {lockedSourceAccount ? (
            <ReadOnlyAccountField
              label="Conta"
              required
              avatarUrl={lockedSourceAccount.avatarUrl}
              name={lockedSourceAccount.name}
              description={lockedSourceAccount.description}
              data-testid={TransactionsTestIds.ReadOnlyAccount}
            />
          ) : isTransfer ? (
            <Controller
              key="account-personal"
              control={control}
              name="account_id"
              render={({ field }) => {
                const selected = accounts.find((a) => a.id === field.value);
                return (
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
                    leftSection={selected ? <AccountAvatar account={selected} size={20} /> : null}
                    renderOption={renderAccountOption(accounts, TransactionsTestIds.OptionAccount)}
                    data-testid={TransactionsTestIds.SelectAccount}
                  />
                );
              }}
            />
          ) : (
            <Controller
              key="account-grouped"
              control={control}
              name="account_id"
              render={({ field }) => {
                const selected = accounts.find((a) => a.id === field.value);
                return (
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
                    leftSection={selected ? <AccountAvatar account={selected} size={20} /> : null}
                    renderOption={renderAccountOption(accounts, TransactionsTestIds.OptionAccount)}
                    data-testid={TransactionsTestIds.SelectAccount}
                  />
                );
              }}
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
          lockedDestinationAccount ? (
            <ReadOnlyAccountField
              label="Conta de destino"
              required
              avatarUrl={lockedDestinationAccount.avatarUrl}
              name={lockedDestinationAccount.name}
              description={lockedDestinationAccount.description}
              data-testid={TransactionsTestIds.ReadOnlyDestinationAccount}
            />
          ) : (
            <Controller
              key="destination-account"
              control={control}
              name="destination_account_id"
              render={({ field }) => {
                const selected = accounts.find((a) => a.id === field.value);
                return (
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
                    leftSection={selected ? <AccountAvatar account={selected} size={20} /> : null}
                    renderOption={renderAccountOption(accounts, TransactionsTestIds.OptionDestinationAccount)}
                    data-testid={TransactionsTestIds.SelectDestinationAccount}
                  />
                );
              }}
            />
          )
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
          forceOpen={panelsWithErrors}
          splitApplicable={splitApplicable}
          isUpdate={isUpdate}
          hideRecurrence={hideRecurrence}
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
