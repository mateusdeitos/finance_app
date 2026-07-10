import { Transactions } from "@/types/transactions";
import type { TransactionFormValues } from "./transactionFormSchema";

/**
 * Inverse of `buildTemplateFormPatch`: transaction-form values -> `TemplatePayload`.
 * Resolves tag names to ids (drops names with no matching tag — templates cannot
 * create new tags). Never emits `amount`/`date`. Transfer-aware, mirroring
 * `buildTransactionPayload`'s transfer branches.
 */
export function buildTemplatePayloadFromForm(
  values: TransactionFormValues,
  tags: Transactions.Tag[],
): Transactions.TemplatePayload {
  const isTransfer = values.transaction_type === "transfer";

  const tagIds = values.tags
    .map((name) => tags.find((t) => t.name === name)?.id)
    .filter((id): id is number => id != null);

  return {
    type: values.transaction_type,
    description: values.description,
    // account_id has no null/undefined variant in TransactionFormValues; 0 is the
    // form's existing "unselected" sentinel, so treat it as omitted here too.
    account_id: values.account_id || undefined,
    category_id: isTransfer || !values.category_id ? undefined : values.category_id,
    destination_account_id: isTransfer ? (values.destination_account_id ?? undefined) : undefined,
    tag_ids: tagIds.length > 0 ? tagIds : undefined,
    split_settings:
      !isTransfer && values.split_settings.length > 0
        ? values.split_settings.map((s) => ({
            connection_id: s.connection_id,
            percentage: s.percentage,
            amount: s.amount,
            date: s.date ?? undefined,
          }))
        : undefined,
  };
}
