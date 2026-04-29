import { Transactions } from '@/types/transactions'
import type { ImportRowFormValues } from '@/components/transactions/form/importFormSchema'

export const CSV_COLUMNS = [
  { col: 'Data', required: true, description: 'Formato DD/MM/AAAA' },
  { col: 'Descrição', required: true, description: 'Texto livre' },
  {
    col: 'Valor',
    required: true,
    description: 'Valor da transação, se negativo será considerada uma despesa, se positivo uma receita',
  },
  {
    col: 'Categoria',
    required: false,
    description: 'Nome da categoria (opcional). Se informada e encontrada, será pré-selecionada',
  },
]

export function buildPayload(row: ImportRowFormValues): Transactions.CreateTransactionPayload {
  const payload: Transactions.CreateTransactionPayload = {
    transaction_type: row.transaction_type,
    account_id: row.account_id ?? undefined,
    amount: row.amount,
    date: row.date,
    description: row.description,
  }
  if (row.transaction_type !== 'transfer' && row.category_id) payload.category_id = row.category_id
  if (row.transaction_type === 'transfer' && row.destination_account_id) {
    payload.destination_account_id = row.destination_account_id
  }
  if (
    row.recurrenceEnabled &&
    row.recurrenceType &&
    row.recurrenceCurrentInstallment != null &&
    row.recurrenceTotalInstallments != null
  ) {
    payload.recurrence_settings = {
      type: row.recurrenceType,
      current_installment: row.recurrenceCurrentInstallment,
      total_installments: row.recurrenceTotalInstallments,
    }
  }
  if (row.transaction_type !== 'transfer' && row.split_settings?.length) {
    payload.split_settings = row.split_settings.map((s) => ({
      connection_id: s.connection_id,
      amount: s.amount,
    }))
  }
  return payload
}

export function parsedRowToFormValues(
  r: Transactions.ParsedImportRow,
  accountId: number,
): ImportRowFormValues {
  return {
    row_index: r.row_index,
    original_description: r.description,
    status: r.status,
    parse_errors: r.parse_errors ?? [],
    action: r.status === 'duplicate' ? 'duplicate' : 'import',
    import_status: 'idle',
    import_error: '',
    account_id: accountId,
    date: r.date ?? '',
    description: r.description,
    amount: r.amount,
    transaction_type: r.type,
    category_id: r.category_id ?? null,
    destination_account_id: r.destination_account_id ?? null,
    recurrenceEnabled: !!r.recurrence_type,
    recurrenceType: r.recurrence_type ?? null,
    recurrenceCurrentInstallment: r.recurrence_current_installment ?? null,
    recurrenceTotalInstallments: r.recurrence_count ?? null,
    split_settings: [],
  }
}
