import { useRef, forwardRef, useImperativeHandle } from 'react'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Stack,
  SegmentedControl,
  Select,
  TagsInput,
  Button,
  Alert,
  Group,
  SimpleGrid,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { useTags } from '@/hooks/useTags'
import { useCreateTransaction } from '@/hooks/useCreateTransaction'
import { Transactions } from '@/types/transactions'
import { CurrencyInput, CurrencyInputHandle } from './CurrencyInput'
import { DescriptionAutocomplete } from './DescriptionAutocomplete'
import { RecurrenceFields } from './RecurrenceFields'
import { SplitSettingsFields } from './SplitSettingsFields'
import { transactionFormSchema, TransactionFormValues } from './transactionFormSchema'

export type { TransactionFormValues }

export interface TransactionFormHandle {
  focusAmount: () => void
}

interface Props {
  currentUserId: number
  initialValues?: Partial<TransactionFormValues>
  onSuccess: () => void
  onSavePrefill: (date: string, categoryId: number | null, accountId: number | null) => void
  onTypeChange?: (type: Transactions.TransactionType) => void
}

export const TransactionForm = forwardRef<TransactionFormHandle, Props>(function TransactionForm(
  { currentUserId, initialValues, onSuccess, onSavePrefill, onTypeChange }: Props,
  ref,
) {
  const amountRef = useRef<CurrencyInputHandle>(null)

  useImperativeHandle(ref, () => ({
    focusAmount: () => amountRef.current?.focus(),
  }))

  const { query: accountsQuery } = useAccounts()
  const { query: categoriesQuery } = useCategories()
  const { query: tagsQuery } = useTags()

  const accounts = accountsQuery.data ?? []
  const categories = categoriesQuery.data ?? []
  const existingTags = tagsQuery.data ?? []

  const {
    control,
    handleSubmit,
    setValue,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      transaction_type: 'expense',
      date: new Date().toISOString().split('T')[0],
      description: '',
      amount: 0,
      account_id: null,
      category_id: null,
      destination_account_id: null,
      tags: [],
      split_settings: [],
      recurrenceEnabled: false,
      recurrenceType: 'monthly',
      recurrenceEndDateMode: false,
      recurrenceEndDate: null,
      recurrenceRepetitions: null,
      ...initialValues,
    },
  })

  const transactionType = useWatch({ control, name: 'transaction_type' })
  const isTransfer = transactionType === 'transfer'

  const { mutation } = useCreateTransaction({
    onFieldErrors: (fieldErrors) => {
      for (const [field, message] of Object.entries(fieldErrors)) {
        if (field === '_general') continue
        setError(field as keyof TransactionFormValues, { message })
      }
    },
    onSuccess: () => {
      const values = getValues()
      onSavePrefill(values.date, values.category_id, values.account_id)
      onSuccess()
    },
  })

  const generalError =
    (errors as Record<string, { message?: string }>)['_general']?.message

  const onSubmit = (values: TransactionFormValues) => {
    const resolvedTags = values.tags.map((name) => {
      const existing = existingTags.find((t) => t.name === name)
      return existing ? { id: existing.id, name } : { name }
    })

    const payload: Transactions.CreateTransactionPayload = {
      transaction_type: values.transaction_type,
      date: values.date,
      description: values.description,
      amount: values.amount,
      account_id: values.account_id!,
      category_id: isTransfer || !values.category_id ? undefined : values.category_id,
      destination_account_id: isTransfer ? values.destination_account_id ?? undefined : undefined,
      tags: resolvedTags.length > 0 ? resolvedTags : undefined,
      split_settings:
        !isTransfer && values.split_settings.length > 0 ? values.split_settings : undefined,
      recurrence_settings: values.recurrenceEnabled
        ? {
            type: values.recurrenceType,
            repetitions: !values.recurrenceEndDateMode && values.recurrenceRepetitions
              ? values.recurrenceRepetitions
              : undefined,
            end_date: values.recurrenceEndDateMode && values.recurrenceEndDate
              ? values.recurrenceEndDate
              : undefined,
          }
        : undefined,
    }

    mutation.mutate(payload)
  }

  function handleSuggestionSelect(suggestion: Transactions.TransactionSuggestion) {
    setValue('transaction_type', suggestion.type)
    setValue('amount', suggestion.amount)
    if (suggestion.account_id) setValue('account_id', suggestion.account_id)
    if (suggestion.category_id) setValue('category_id', suggestion.category_id)
    if (suggestion.tags) setValue('tags', suggestion.tags.map((t) => t.name))
    // Clear split settings on autocomplete to avoid stale data
    setValue('split_settings', [])
  }

  const accountOptions = accounts
    .filter((a) => !a.user_connection)
    .map((a) => ({ value: String(a.id), label: a.name }))

  const destinationAccountOptions = [
    ...accounts
      .filter((a) => !a.user_connection)
      .map((a) => ({ value: String(a.id), label: a.name, group: 'Minhas contas' })),
    ...accounts
      .filter((a) => a.user_connection?.connection_status === 'accepted')
      .map((a) => ({ value: String(a.id), label: a.description || a.name, group: 'Contas compartilhadas' })),
  ]

  const categoryOptions = categories
    .filter((c) => !c.parent_id)
    .map((c) => ({ value: String(c.id), label: c.emoji ? `${c.emoji} ${c.name}` : c.name }))

  const tagNames = existingTags.map((t) => t.name)

  const recurrenceErrors = {
    repetitions: errors.recurrenceRepetitions?.message,
    end_date: errors.recurrenceEndDate?.message,
  }

  const splitErrors = Object.fromEntries(
    Object.entries(errors as Record<string, { message?: string }>)
      .filter(([k]) => k.startsWith('split_settings'))
      .map(([k, v]) => [k, v?.message ?? '']),
  )

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack gap="md">
        {generalError && (
          <Alert color="red" title="Erro" variant="light">
            {generalError}
          </Alert>
        )}

        <Controller
          control={control}
          name="transaction_type"
          render={({ field }) => (
            <SegmentedControl
              data={[
                { value: 'expense', label: 'Despesa' },
                { value: 'income', label: 'Receita' },
                { value: 'transfer', label: 'Transferência' },
              ]}
              value={field.value}
              onChange={(val) => {
                field.onChange(val)
                if (val === 'transfer') setValue('split_settings', [])
                onTypeChange?.(val as Transactions.TransactionType)
              }}
              fullWidth
            />
          )}
        />

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Controller
            control={control}
            name="date"
            render={({ field }) => (
              <DatePickerInput
                label="Data"
                required
                value={field.value ? new Date(field.value) : null}
                onChange={(date) =>
                  field.onChange(date ? String(date).split('T')[0] : '')
                }
                error={errors.date?.message}
                valueFormat="DD/MM/YYYY"
              />
            )}
          />

          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <CurrencyInput
                ref={amountRef}
                label="Valor (R$)"
                required
                value={field.value}
                onChange={field.onChange}
                error={errors.amount?.message}
              />
            )}
          />
        </SimpleGrid>

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
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Controller
              control={control}
              name="account_id"
              render={({ field }) => (
                <Select
                  label="Conta"
                  required
                  data={accountOptions}
                  value={field.value ? String(field.value) : null}
                  onChange={(val) => field.onChange(val ? Number(val) : null)}
                  error={errors.account_id?.message}
                  searchable
                />
              )}
            />
            <Controller
              control={control}
              name="destination_account_id"
              render={({ field }) => (
                <Select
                  label="Conta de destino"
                  required
                  data={destinationAccountOptions}
                  value={field.value ? String(field.value) : null}
                  onChange={(val) => field.onChange(val ? Number(val) : null)}
                  error={errors.destination_account_id?.message}
                  searchable
                />
              )}
            />
          </SimpleGrid>
        ) : (
          <>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Controller
                control={control}
                name="category_id"
                render={({ field }) => (
                  <Select
                    label="Categoria"
                    data={categoryOptions}
                    value={field.value ? String(field.value) : null}
                    onChange={(val) => field.onChange(val ? Number(val) : null)}
                    error={errors.category_id?.message}
                    searchable
                    clearable
                  />
                )}
              />
              <Controller
                control={control}
                name="account_id"
                render={({ field }) => (
                  <Select
                    label="Conta"
                    required
                    data={accountOptions}
                    value={field.value ? String(field.value) : null}
                    onChange={(val) => field.onChange(val ? Number(val) : null)}
                    error={errors.account_id?.message}
                    searchable
                  />
                )}
              />
            </SimpleGrid>

            <SplitSettingsFields
              control={control}
              accounts={accounts}
              currentUserId={currentUserId}
              errors={splitErrors}
            />
          </>
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
            />
          )}
        />

        <RecurrenceFields
          control={control}
          errors={recurrenceErrors}
        />

        <Group justify="flex-end" mt="sm">
          <Button type="submit" loading={isSubmitting || mutation.isPending}>
            Salvar
          </Button>
        </Group>
      </Stack>
    </form>
  )
})
