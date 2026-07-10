import type { FocusEvent, ReactNode } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import {
  type ComboboxItem,
  type ComboboxItemGroup,
  Group,
  SegmentedControl,
  Select,
  Stack,
  TagsInput,
} from "@mantine/core";
import { IconArrowRight, IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import { useAccounts } from "@/hooks/useAccounts";
import { useFlattenCategories } from "@/hooks/useCategories";
import { useGroupedAccountOptions } from "@/hooks/useGroupedAccountOptions";
import { useTags } from "@/hooks/useTags";
import { DescriptionAutocomplete } from "@/components/transactions/form/DescriptionAutocomplete";
import { SplitSettingsFields } from "@/components/transactions/form/SplitSettingsFields";
import { Transactions } from "@/types/transactions";
import { TransactionsTestIds, type TransactionType } from "@/testIds";
import type { TemplateFormValues } from "./templateFormSchema";

const TYPE_LABEL: Record<TransactionType, string> = {
  expense: "Despesa",
  income: "Receita",
  transfer: "Transferência",
};

const TYPE_ICON: Record<TransactionType, ReactNode> = {
  expense: <IconTrendingDown size={14} />,
  income: <IconTrendingUp size={14} />,
  transfer: <IconArrowRight size={14} />,
};

/** Copied from `TransactionForm`'s Select-blur "type to select" helper. */
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
      if (isItemGroup(o)) items.push(...o.items);
      else items.push(o);
    });
    const match = items.find((o) => o.label.toLowerCase() === typed);
    if (match) onChange(Number(match.value));
  };
}

/**
 * Field building blocks copied from `TransactionForm` / `TransactionAccordionSections`
 * (D-06), reduced to what a template needs: type, account, category/destination,
 * description, tags, split (in `templateMode`). No amount/date/recurrence.
 */
export function TemplateFormFields() {
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<TemplateFormValues>();

  const { query: accountsQuery } = useAccounts();
  const { query: categoriesQuery } = useFlattenCategories();
  const { query: tagsQuery } = useTags();

  const accounts = accountsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const tagNames = (tagsQuery.data ?? []).map((t) => t.name);

  const transactionType = useWatch({ control, name: "transaction_type" });
  const isTransfer = transactionType === "transfer";

  const personalAccountOptions = accounts
    .filter((a) => !a.user_connection)
    .map((a) => ({ value: String(a.id), label: a.name }));
  const groupedAccountOptions = useGroupedAccountOptions(accounts);
  const categoryOptions = categories.map((c) => ({
    value: String(c.id),
    label: c.emoji ? `${c.emoji} ${c.name}` : c.name,
  }));

  /** Prefills type/account/category/tags from a matching past description —
   * mirrors `TransactionForm.handleSuggestionSelect` minus the amount fill
   * (templates have no amount field). */
  function handleSuggestionSelect(suggestion: Transactions.TransactionSuggestion) {
    setValue("transaction_type", suggestion.type);
    if (suggestion.account_id) setValue("account_id", suggestion.account_id);
    if (suggestion.category_id) setValue("category_id", suggestion.category_id);
    if (suggestion.tags) setValue("tags", suggestion.tags.map((t) => t.name));
  }

  return (
    <Stack gap="md">
      <Controller
        control={control}
        name="transaction_type"
        render={({ field }) => (
          <SegmentedControl
            data={(["expense", "income", "transfer"] as const).map((t) => ({
              value: t,
              label: (
                <Group gap={6} wrap="nowrap" justify="center">
                  {TYPE_ICON[t]}
                  <span data-testid={TransactionsTestIds.SegmentTransactionType(t)}>{TYPE_LABEL[t]}</span>
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

      {isTransfer ? (
        <Controller
          key="account-personal"
          control={control}
          name="account_id"
          render={({ field }) => (
            <Select
              label="Conta"
              required
              data={personalAccountOptions}
              value={field.value ? String(field.value) : null}
              onChange={(val) => field.onChange(val ? Number(val) : 0)}
              onBlur={makeSelectBlurHandler(personalAccountOptions, (val) => field.onChange(val ?? 0))}
              error={errors.account_id?.message}
              searchable
              renderOption={({ option }) => (
                <span data-testid={TransactionsTestIds.OptionAccount(option.value)}>{option.label}</span>
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
              label="Conta"
              required
              data={groupedAccountOptions}
              value={field.value ? String(field.value) : null}
              onChange={(val) => field.onChange(val ? Number(val) : 0)}
              onBlur={makeSelectBlurHandler(groupedAccountOptions, (val) => field.onChange(val ?? 0))}
              error={errors.account_id?.message}
              searchable
              renderOption={({ option }) => (
                <span data-testid={TransactionsTestIds.OptionAccount(option.value)}>{option.label}</span>
              )}
              data-testid={TransactionsTestIds.SelectAccount}
            />
          )}
        />
      )}

      <Controller
        control={control}
        name="description"
        render={({ field }) => (
          <DescriptionAutocomplete
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
              label="Categoria"
              data={categoryOptions}
              value={field.value ? String(field.value) : null}
              onChange={(val) => field.onChange(val ? Number(val) : null)}
              onBlur={makeSelectBlurHandler(categoryOptions, (val) => field.onChange(val))}
              error={errors.category_id?.message}
              searchable
              clearable
              renderOption={({ option }) => (
                <span data-testid={TransactionsTestIds.OptionCategory(option.value)}>{option.label}</span>
              )}
              data-testid={TransactionsTestIds.SelectCategory}
            />
          )}
        />
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
            data-testid={TransactionsTestIds.TagsInput}
          />
        )}
      />

      <SplitSettingsFields templateMode />
    </Stack>
  );
}
