import { Switch, Select, NumberInput, Stack, Group } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { Controller, useWatch, useFormContext } from 'react-hook-form'

interface RecurrenceFieldsProps {
  /**
   * Prefix prepended to every field name, e.g. `"rows.2."`.
   * Defaults to `""` (top-level), which is the transaction form usage.
   */
  namePrefix?: string
  /**
   * Whether the type Select's dropdown renders inside a portal.
   * Set to `false` when RecurrenceFields is rendered inside a Popover to
   * prevent the combobox from closing the containing popover.
   */
  comboboxWithinPortal?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFormValues = any

export function RecurrenceFields({
  namePrefix = '',
  comboboxWithinPortal = true,
}: RecurrenceFieldsProps) {
  const { control, formState: { errors } } = useFormContext<AnyFormValues>()
  const endDateMode = useWatch({ control, name: `${namePrefix}recurrenceEndDateMode` }) as boolean | undefined

  /** Resolve a dot-separated error path against the errors object. */
  function fieldError(suffix: string): string | undefined {
    const parts = `${namePrefix}${suffix}`.split('.')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cur: any = errors
    for (const p of parts) {
      if (cur == null) return undefined
      cur = /^\d+$/.test(p) ? cur[Number(p)] : cur[p]
    }
    return cur?.message as string | undefined
  }

  return (
    <Stack gap="sm">
      <Controller
        control={control}
        name={`${namePrefix}recurrenceType`}
        render={({ field }) => (
          <Select
            label="Frequência"
            data={[
              { value: 'daily', label: 'Diário' },
              { value: 'weekly', label: 'Semanal' },
              { value: 'monthly', label: 'Mensal' },
              { value: 'yearly', label: 'Anual' },
            ]}
            value={(field.value as string | null) ?? null}
            onChange={field.onChange}
            error={fieldError('recurrenceType')}
            comboboxProps={{ withinPortal: comboboxWithinPortal }}
            clearable
          />
        )}
      />

      <Group gap="sm">
        <Controller
          control={control}
          name={`${namePrefix}recurrenceEndDateMode`}
          render={({ field }) => (
            <Switch
              label="Usar data de término"
              checked={!!field.value}
              onChange={(e) => field.onChange(e.currentTarget.checked)}
            />
          )}
        />
      </Group>

      {endDateMode ? (
        <Controller
          control={control}
          name={`${namePrefix}recurrenceEndDate`}
          render={({ field }) => (
            <DatePickerInput
              label="Data de término"
              value={field.value ? new Date(field.value as string) : null}
              onChange={(date) =>
                field.onChange(date ? String(date).split('T')[0] : null)
              }
              error={fieldError('recurrenceEndDate')}
              valueFormat="DD/MM/YYYY"
            />
          )}
        />
      ) : (
        <Controller
          control={control}
          name={`${namePrefix}recurrenceRepetitions`}
          render={({ field }) => (
            <NumberInput
              label="Repetições"
              description="Número de parcelas"
              min={1}
              value={(field.value as number | null) ?? ''}
              onChange={(val) => field.onChange(val === '' ? null : Number(val))}
              error={fieldError('recurrenceRepetitions')}
            />
          )}
        />
      )}
    </Stack>
  )
}
