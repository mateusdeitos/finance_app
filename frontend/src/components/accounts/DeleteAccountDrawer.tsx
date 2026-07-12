import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Alert,
  Button,
  type ComboboxItem,
  Group,
  SegmentedControl,
  Stack,
  Text,
} from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { ResponsiveDrawer } from '@/components/ResponsiveDrawer'
import { ResponsiveSelect } from '@/components/ResponsiveSelect'
import { AccountAvatar } from '@/components/AccountAvatar'
import { useDrawerContext } from '@/utils/renderDrawer'
import { useAccounts } from '@/hooks/useAccounts'
import { useDeleteAccount } from '@/hooks/useDeleteAccount'
import { Transactions } from '@/types/transactions'
import { AccountsTestIds } from '@/testIds'

const schema = z
  .object({
    strategy: z.enum(['delete_transactions', 'migrate']),
    target_account_id: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.strategy === 'migrate' && !values.target_account_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target_account_id'],
        message: 'Selecione a conta de destino',
      })
    }
  })

type DeleteAccountFormValues = z.infer<typeof schema>

interface Props {
  account: Transactions.Account
  transactionCount: number
}

export function DeleteAccountDrawer({ account, transactionCount }: Props) {
  const { opened, close, reject } = useDrawerContext<'confirmed' | void>()
  const { invalidate } = useAccounts()
  const { query: targetOptionsQuery } = useAccounts((accounts) =>
    accounts.filter((a) => a.is_active && !a.user_connection && a.id !== account.id),
  )
  const targetAccounts = targetOptionsQuery.data ?? []

  const { mutation } = useDeleteAccount({
    onSuccess: async () => {
      await invalidate()
      close('confirmed')
    },
  })

  const { control, handleSubmit, formState: { errors } } = useForm<DeleteAccountFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { strategy: 'delete_transactions', target_account_id: undefined },
  })

  const strategy = useWatch({ control, name: 'strategy' })

  function onSubmit(values: DeleteAccountFormValues) {
    mutation.mutate({
      id: account.id,
      strategy: values.strategy,
      targetAccountId:
        values.strategy === 'migrate' && values.target_account_id
          ? Number(values.target_account_id)
          : undefined,
    })
  }

  return (
    <ResponsiveDrawer
      opened={opened}
      onClose={reject}
      title="Excluir conta"
      data-testid={AccountsTestIds.DeleteDrawer}
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <Stack gap="md">
          <Alert color="orange" icon={<IconAlertTriangle size={18} />}>
            <Text size="sm" data-testid={AccountsTestIds.DeleteTransactionCount}>
              A conta <strong>{account.name}</strong> possui {transactionCount}{' '}
              {transactionCount === 1 ? 'transação vinculada' : 'transações vinculadas'}. Escolha o que
              fazer com elas antes de excluir a conta.
            </Text>
          </Alert>

          <Controller
            control={control}
            name="strategy"
            render={({ field }) => (
              <SegmentedControl
                fullWidth
                value={field.value}
                onChange={field.onChange}
                data-testid={AccountsTestIds.SegmentDeleteStrategy}
                data={[
                  {
                    value: 'delete_transactions',
                    label: (
                      <span data-testid={AccountsTestIds.SegmentDeleteStrategyOption('delete_transactions')}>
                        Excluir transações
                      </span>
                    ),
                  },
                  {
                    value: 'migrate',
                    label: (
                      <span data-testid={AccountsTestIds.SegmentDeleteStrategyOption('migrate')}>
                        Migrar para outra conta
                      </span>
                    ),
                  },
                ]}
              />
            )}
          />

          {strategy === 'migrate' && (
            <Controller
              control={control}
              name="target_account_id"
              render={({ field }) => (
                <ResponsiveSelect
                  label="Conta de destino"
                  placeholder="Selecione uma conta"
                  value={field.value ?? null}
                  onChange={(value) => field.onChange(value ?? undefined)}
                  error={errors.target_account_id?.message}
                  data-testid={AccountsTestIds.SelectMigrateTarget}
                  data={targetAccounts.map((a) => ({ value: String(a.id), label: a.name }))}
                  renderOption={({ option }: { option: ComboboxItem }) => {
                    const acc = targetAccounts.find((a) => String(a.id) === option.value)
                    return (
                      <Group gap={8} wrap="nowrap" data-testid={AccountsTestIds.OptionMigrateTarget(Number(option.value))}>
                        <AccountAvatar account={acc} size={22} />
                        <Text size="sm">{acc?.name ?? option.label}</Text>
                      </Group>
                    )
                  }}
                />
              )}
            />
          )}

          {mutation.error && (
            <Alert color="red" data-testid={AccountsTestIds.AlertDeleteError}>
              {mutation.error.message}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={reject}>Cancelar</Button>
            <Button
              type="submit"
              color="red"
              loading={mutation.isPending}
              data-testid={AccountsTestIds.BtnConfirmDelete}
            >
              Excluir conta
            </Button>
          </Group>
        </Stack>
      </form>
    </ResponsiveDrawer>
  )
}
