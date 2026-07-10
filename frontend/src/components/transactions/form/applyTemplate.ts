import { Transactions } from "@/types/transactions";
import type { TransactionFormValues } from "./transactionFormSchema";

interface Refs {
  accounts: Transactions.Account[];
  categories: Transactions.Category[];
  tags: Transactions.Tag[];
}

/**
 * The subset of `TransactionFormValues` a template apply sets. Never includes
 * `amount` or `date` — the caller blanks the amount and focuses it separately
 * (APPLY-02); `date` stays whatever the form already has (defaults to today).
 */
export type TemplateFormPatch = Pick<
  TransactionFormValues,
  | "transaction_type"
  | "description"
  | "account_id"
  | "category_id"
  | "destination_account_id"
  | "tags"
  | "split_settings"
>;

/**
 * Maps a template payload onto transaction-form fields, clearing references
 * (account/category/destination account/tags) that no longer exist so a
 * stale template applies cleanly (APPLY-04). Never sets amount or date.
 */
export function buildTemplateFormPatch(
  payload: Transactions.TemplatePayload,
  { accounts, categories, tags }: Refs,
): TemplateFormPatch {
  const accountExists = (id?: number | null): id is number =>
    id != null && accounts.some((a) => a.id === id);
  const categoryExists = (id?: number | null): id is number =>
    id != null && categories.some((c) => c.id === id);

  const tagNames = (payload.tag_ids ?? [])
    .map((id) => tags.find((t) => t.id === id)?.name)
    .filter((n): n is string => Boolean(n));

  return {
    transaction_type: payload.type,
    description: payload.description ?? "",
    // account_id has no null/undefined variant in TransactionFormValues; 0 is
    // the form's existing "unselected" sentinel (Select treats falsy as empty).
    account_id: accountExists(payload.account_id) ? payload.account_id : 0,
    category_id: categoryExists(payload.category_id) ? payload.category_id : null,
    destination_account_id: accountExists(payload.destination_account_id)
      ? payload.destination_account_id
      : null,
    tags: tagNames,
    split_settings: payload.split_settings ?? [],
  };
}
