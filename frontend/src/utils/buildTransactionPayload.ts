import { Transactions } from '@/types/transactions'
import { TransactionFormValues } from '@/components/transactions/form/transactionFormSchema'

export function buildTransactionPayload(
  values: TransactionFormValues,
  existingTags: Transactions.Tag[]
): Transactions.CreateTransactionPayload {
  const isTransfer = values.transaction_type === 'transfer'

  const resolvedTags = values.tags.map((name) => {
    const existing = existingTags.find((t) => t.name === name)
    return existing ? { id: existing.id, name } : { name }
  })

  const dateStr = values.date instanceof Date
    ? values.date.toISOString()
    : (values.date as unknown as string)

  return {
    transaction_type: values.transaction_type,
    date: dateStr,
    description: values.description,
    amount: values.amount,
    account_id: values.account_id!,
    category_id: isTransfer || !values.category_id ? undefined : values.category_id,
    destination_account_id: isTransfer ? (values.destination_account_id ?? undefined) : undefined,
    tags: resolvedTags.length > 0 ? resolvedTags : undefined,
    split_settings:
      !isTransfer && values.split_settings.length > 0 ? values.split_settings : undefined,
    recurrence_settings: values.recurrenceEnabled
      ? {
          type: values.recurrenceType,
          repetitions:
            !values.recurrenceEndDateMode && values.recurrenceRepetitions
              ? values.recurrenceRepetitions
              : undefined,
          end_date:
            values.recurrenceEndDateMode && values.recurrenceEndDate
              ? values.recurrenceEndDate
              : undefined,
        }
      : undefined,
  }
}
