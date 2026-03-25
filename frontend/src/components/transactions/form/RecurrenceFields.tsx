import { Switch, Select, NumberInput, Stack, Group, Alert } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { Controller, Control, useWatch } from 'react-hook-form'
import type { TransactionFormValues } from './TransactionForm'

interface RecurrenceErrors {
  type?: string
  repetitions?: string
  end_date?: string
  _general?: string
}

interface Props {
  control: Control<TransactionFormValues>
  errors?: RecurrenceErrors
}

export function RecurrenceFields({ control, errors }: Props) {
  const enabled = useWatch({ control, name: 'recurrenceEnabled' })
  const endDateMode = useWatch({ control, name: 'recurrenceEndDateMode' })

  return (
    <Stack gap="xs">
      <Controller
        control={control}
        name="recurrenceEnabled"
        render={({ field }) => (
          <Switch
            label="Recorrência"
            checked={field.value}
            onChange={(e) => field.onChange(e.currentTarget.checked)}
          />
        )}
      />

      {enabled && (
        <Stack gap="sm" pl="md">
          {errors?._general && (
            <Alert color="red" variant="light" p="xs">
              {errors._general}
            </Alert>
          )}

          <Controller
            control={control}
            name="recurrenceType"
            render={({ field }) => (
              <Select
                label="Frequência"
                data={[
                  { value: 'daily', label: 'Diário' },
                  { value: 'weekly', label: 'Semanal' },
                  { value: 'monthly', label: 'Mensal' },
                  { value: 'yearly', label: 'Anual' },
                ]}
                value={field.value}
                onChange={field.onChange}
                error={errors?.type}
              />
            )}
          />

          <Group gap="sm">
            <Controller
              control={control}
              name="recurrenceEndDateMode"
              render={({ field }) => (
                <Switch
                  label="Usar data de término"
                  checked={field.value}
                  onChange={(e) => field.onChange(e.currentTarget.checked)}
                />
              )}
            />
          </Group>

          {endDateMode ? (
            <Controller
              control={control}
              name="recurrenceEndDate"
              render={({ field }) => (
                <DatePickerInput
                  label="Data de término"
                  value={field.value ? new Date(field.value) : null}
                  onChange={(date) =>
                    field.onChange(date ? date.toISOString().split('T')[0] : null)
                  }
                  error={errors?.end_date}
                  valueFormat="DD/MM/YYYY"
                />
              )}
            />
          ) : (
            <Controller
              control={control}
              name="recurrenceRepetitions"
              render={({ field }) => (
                <NumberInput
                  label="Repetições"
                  description="Número de parcelas"
                  min={1}
                  value={field.value ?? ''}
                  onChange={(val) => field.onChange(val === '' ? null : Number(val))}
                  error={errors?.repetitions}
                />
              )}
            />
          )}

        </Stack>
      )}
    </Stack>
  )
}
