import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Stack, TextInput, Textarea, Button, Group, Alert } from '@mantine/core'
import { CurrencyInput } from '@/components/transactions/form/CurrencyInput'
import { Transactions } from '@/types/transactions'

const schema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().optional(),
  initial_balance: z.number().int(),
})

export type AccountFormValues = z.infer<typeof schema>

interface Props {
  initialValues?: Partial<AccountFormValues>
  account?: Transactions.Account
  onSubmit: (values: AccountFormValues) => void
  isPending: boolean
  error?: string
}

export function AccountForm({ initialValues, onSubmit, isPending, error }: Props) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      initial_balance: 0,
      ...initialValues,
    },
  })

  useEffect(() => {
    if (initialValues) reset({ name: '', description: '', initial_balance: 0, ...initialValues })
  }, [initialValues, reset])

  const initialBalance = watch('initial_balance')

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack gap="md">
        {error && (
          <Alert color="red" title="Erro" variant="light">
            {error}
          </Alert>
        )}

        <TextInput
          label="Nome"
          required
          {...register('name')}
          error={errors.name?.message}
        />

        <Textarea
          label="Descrição"
          autosize
          minRows={2}
          {...register('description')}
          error={errors.description?.message}
        />

        <CurrencyInput
          label="Saldo inicial (R$)"
          value={initialBalance}
          onChange={(val) => setValue('initial_balance', val)}
          error={errors.initial_balance?.message}
        />

        <Group justify="flex-end" mt="sm">
          <Button type="submit" loading={isPending}>
            Salvar
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
