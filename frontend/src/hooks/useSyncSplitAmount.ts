import { useEffect } from 'react'
import type { FieldPath, FieldValues, UseFormSetValue } from 'react-hook-form'

/**
 * Keeps a split row's amount and percentage fields in sync with the selected
 * `mode`. When in percentage mode, the amount field follows the computed value;
 * when switching to amount mode, the percentage field is cleared.
 */
export function useSyncSplitAmount<T extends FieldValues>(
  setValue: UseFormSetValue<T>,
  amountFieldName: FieldPath<T>,
  percentageFieldName: FieldPath<T>,
  mode: 'percentage' | 'amount',
  calculatedAmount: number,
  percentage: number,
) {
  useEffect(() => {
    if (mode !== 'percentage') return
    // Casts: setValue is generic over FieldPath<T>, but field values at dynamic
    // paths can't be narrowed from inside a reusable hook without duplicating
    // T's structure. The caller guarantees these fields accept number | undefined.
    setValue(amountFieldName, calculatedAmount as unknown as T[FieldPath<T>])
    setValue(percentageFieldName, percentage as unknown as T[FieldPath<T>])
  }, [calculatedAmount, mode, amountFieldName, setValue, percentageFieldName, percentage])

  useEffect(() => {
    if (mode !== 'amount') return
    setValue(percentageFieldName, undefined as unknown as T[FieldPath<T>])
  }, [mode, percentageFieldName, setValue])
}
