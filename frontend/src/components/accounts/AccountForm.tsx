import { useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Stack, TextInput, Textarea, Button, Group, Alert } from '@mantine/core'
import { CurrencyInput } from '@/components/transactions/form/CurrencyInput'
import { ColorSwatchPicker, DEFAULT_AVATAR_COLOR } from '@/components/accounts/ColorSwatchPicker'
import { useResetFormOnChange } from '@/hooks/useResetFormOnChange'
import { Transactions } from '@/types/transactions'
import { AccountsTestIds } from '@/testIds'

const schema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().optional(),
  initial_balance: z.number().int(),
  avatar_background_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
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
    control,
    reset,
    formState: { errors },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      initial_balance: 0,
      avatar_background_color: DEFAULT_AVATAR_COLOR,
      ...initialValues,
    },
  })

  const resetValues = useMemo<AccountFormValues | undefined>(
    () =>
      initialValues
        ? {
            name: '',
            description: '',
            initial_balance: 0,
            avatar_background_color: DEFAULT_AVATAR_COLOR,
            ...initialValues,
          }
        : undefined,
    [initialValues],
  )
  useResetFormOnChange(reset, resetValues)

  const initialBalance = useWatch({ control, name: 'initial_balance' })
  const avatarColor = useWatch({ control, name: 'avatar_background_color' })

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate data-testid={AccountsTestIds.Form}>
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
          data-testid={AccountsTestIds.InputName}
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
          data-testid={AccountsTestIds.InputInitialBalance}
        />

        <ColorSwatchPicker
          label="Cor do avatar"
          value={avatarColor}
          onChange={(hex) => setValue('avatar_background_color', hex)}
        />

        <Group justify="flex-end" mt="sm">
          <Button type="submit" loading={isPending} data-testid={AccountsTestIds.BtnSave}>
            Salvar
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
