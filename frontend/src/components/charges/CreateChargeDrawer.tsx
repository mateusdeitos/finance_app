import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Alert, Button, Drawer, Select, Skeleton, Stack, Text, Textarea } from '@mantine/core'
import { DateInput, MonthPickerInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import { useQuery } from '@tanstack/react-query'
import '@mantine/dates/styles.css'
import { useDrawerContext } from '@/utils/renderDrawer'
import { useCreateCharge } from '@/hooks/useCreateCharge'
import { useCharges } from '@/hooks/useCharges'
import { useChargesPendingCount } from '@/hooks/useChargesPendingCount'
import { useTransactions } from '@/hooks/useTransactions'
import { useAccounts } from '@/hooks/useAccounts'
import { useMe } from '@/hooks/useMe'
import { fetchBalance } from '@/api/transactions'
import { parseApiError, mapTagsToFieldErrors } from '@/utils/apiErrors'
import { QueryKeys } from '@/utils/queryKeys'
import { formatBalance } from '@/utils/formatCents'
import { Charges } from '@/types/charges'

const createChargeSchema = z.object({
  connection_id: z.number({ required_error: 'Selecione uma conexao' }),
  my_account_id: z.number({ required_error: 'Selecione uma conta' }),
  period_month: z.number().min(1).max(12),
  period_year: z.number(),
  description: z.string().optional(),
  date: z.date({ required_error: 'Selecione uma data' }),
})

type CreateChargeFormValues = z.infer<typeof createChargeSchema>

interface CreateChargeDrawerProps {
  periodMonth: number
  periodYear: number
}

export function CreateChargeDrawer({ periodMonth, periodYear }: CreateChargeDrawerProps) {
  const { opened, close, reject } = useDrawerContext<void>()
  const [submitError, setSubmitError] = useState<string | undefined>()

  const { mutation } = useCreateCharge()
  const { invalidate: invalidateCharges } = useCharges({ month: periodMonth, year: periodYear })
  const { invalidate: invalidatePendingCount } = useChargesPendingCount()
  const { invalidate: invalidateTransactions } = useTransactions({ month: periodMonth, year: periodYear })
  const { query: accountsQuery } = useAccounts()
  const { query: meQuery } = useMe((me) => me.id)
  const currentUserId = meQuery.data ?? 0

  const accounts = accountsQuery.data ?? []

  // Extract accepted connections from accounts
  const acceptedAccounts = accounts.filter(
    (a) => a.user_connection && a.user_connection.connection_status === 'accepted',
  )

  // Deduplicate connections
  const connectionMap = new Map<number, { label: string; value: string }>()
  for (const acc of acceptedAccounts) {
    const conn = acc.user_connection!
    if (!connectionMap.has(conn.id)) {
      connectionMap.set(conn.id, {
        label: `Conexao ${conn.id}`,
        value: String(conn.id),
      })
    }
  }
  const connectionOptions = Array.from(connectionMap.values())
  const singleConnection = connectionOptions.length === 1 ? connectionOptions[0] : null

  // User's own active accounts
  const myAccounts = accounts
    .filter((a) => a.user_id === currentUserId && a.is_active)
    .map((a) => ({ label: a.name, value: String(a.id) }))

  const defaultPeriod = new Date(periodYear, periodMonth - 1, 1)

  const form = useForm<CreateChargeFormValues>({
    resolver: zodResolver(createChargeSchema),
    defaultValues: {
      connection_id: singleConnection ? Number(singleConnection.value) : undefined,
      my_account_id: undefined,
      period_month: periodMonth,
      period_year: periodYear,
      description: '',
      date: new Date(),
    },
  })

  const watchedMonth = form.watch('period_month')
  const watchedYear = form.watch('period_year')
  const watchedConnectionId = form.watch('connection_id')

  // Balance preview query
  const balanceQuery = useQuery({
    queryKey: [QueryKeys.Balance, { month: watchedMonth, year: watchedYear, accumulated: false }],
    queryFn: () => fetchBalance({ month: watchedMonth, year: watchedYear, accumulated: false }),
    enabled: !!watchedConnectionId && !!watchedMonth && !!watchedYear,
  })

  function handleSubmit(values: CreateChargeFormValues) {
    setSubmitError(undefined)
    const payload: Charges.CreateChargePayload = {
      connection_id: values.connection_id,
      my_account_id: values.my_account_id,
      period_month: values.period_month,
      period_year: values.period_year,
      description: values.description || undefined,
      date: values.date.toISOString(),
    }
    mutation.mutate(payload, {
      onSuccess: () => {
        invalidateCharges()
        invalidatePendingCount()
        invalidateTransactions()
        notifications.show({
          color: 'teal',
          title: 'Cobranca criada',
          message: 'Cobranca criada com sucesso',
          autoClose: 3000,
        })
        close()
      },
      onError: async (err) => {
        if (err instanceof Response) {
          const apiError = await parseApiError(err)
          const errors = mapTagsToFieldErrors(apiError.tags, apiError.message)
          for (const [field, message] of Object.entries(errors)) {
            if (field === '_general') {
              setSubmitError(message)
            } else {
              form.setError(field as keyof CreateChargeFormValues, { message })
            }
          }
        } else {
          setSubmitError('Erro ao criar cobranca')
        }
      },
    })
  }

  return (
    <Drawer opened={opened} onClose={reject} title="Criar Cobranca" position="right" size="md">
      <form onSubmit={form.handleSubmit(handleSubmit)} noValidate>
        <Stack gap="md">
          {submitError && (
            <Alert color="red" title="Erro" variant="light">
              {submitError}
            </Alert>
          )}

          {!singleConnection && (
            <Controller
              name="connection_id"
              control={form.control}
              render={({ field, fieldState }) => (
                <Select
                  label="Conexao"
                  placeholder="Selecione uma conexao"
                  data={connectionOptions}
                  value={field.value != null ? String(field.value) : null}
                  onChange={(val) => field.onChange(val != null ? Number(val) : undefined)}
                  error={fieldState.error?.message}
                  required
                />
              )}
            />
          )}

          <Controller
            name="my_account_id"
            control={form.control}
            render={({ field, fieldState }) => (
              <Select
                label="Minha conta"
                placeholder="Selecione uma conta"
                data={myAccounts}
                value={field.value != null ? String(field.value) : null}
                onChange={(val) => field.onChange(val != null ? Number(val) : undefined)}
                error={fieldState.error?.message}
                required
              />
            )}
          />

          <Controller
            name="period_month"
            control={form.control}
            render={({ field, fieldState }) => (
              <MonthPickerInput
                label="Periodo"
                placeholder="Selecione o mes"
                value={new Date(watchedYear, field.value - 1, 1)}
                onChange={(date) => {
                  if (date) {
                    form.setValue('period_month', date.getMonth() + 1)
                    form.setValue('period_year', date.getFullYear())
                  }
                }}
                error={fieldState.error?.message}
                defaultValue={defaultPeriod}
              />
            )}
          />

          <Controller
            name="date"
            control={form.control}
            render={({ field, fieldState }) => (
              <DateInput
                label="Data"
                placeholder="Selecione uma data"
                value={field.value}
                onChange={(date) => field.onChange(date)}
                error={fieldState.error?.message}
                required
              />
            )}
          />

          <Textarea
            label="Descricao (opcional)"
            autosize
            minRows={2}
            {...form.register('description')}
            error={form.formState.errors.description?.message}
          />

          {watchedConnectionId && (
            <div>
              {balanceQuery.isLoading ? (
                <Skeleton height={40} />
              ) : balanceQuery.data ? (
                <Text size="sm" c="dimmed">
                  {balanceQuery.data.balance < 0
                    ? `Voce deve ${formatBalance(Math.abs(balanceQuery.data.balance))}`
                    : `Devem a voce ${formatBalance(balanceQuery.data.balance)}`}
                </Text>
              ) : null}
            </div>
          )}

          <Button
            type="submit"
            loading={mutation.isPending}
            disabled={mutation.isPending}
            fullWidth
          >
            Criar Cobranca
          </Button>
        </Stack>
      </form>
    </Drawer>
  )
}
