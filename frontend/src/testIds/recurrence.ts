/**
 * Testids for RecurrenceFields — a shared component used in both the
 * transaction form and the import review row popover.
 *
 * Parametric (per-row) ids stay as factory functions in the domain-specific
 * testid files (e.g. ImportTestIds).
 */
export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'yearly'

export const RecurrenceTestIds = {
  TypeSelect: 'select_recurrence_type',
  CurrentInstallmentInput: 'input_recurrence_current_installment',
  TotalInstallmentsInput: 'input_recurrence_total_installments',
  OptionType: (type: RecurrenceType) => `option_recurrence_type_${type}` as const,
} as const
