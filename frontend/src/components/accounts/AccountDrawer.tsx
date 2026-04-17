import { Drawer } from '@mantine/core'
import { useDrawerContext } from '@/utils/renderDrawer'
import { useAccounts } from '@/hooks/useAccounts'
import { useCreateAccount } from '@/hooks/useCreateAccount'
import { useUpdateAccount } from '@/hooks/useUpdateAccount'
import { Transactions } from '@/types/transactions'
import { AccountForm, AccountFormValues } from './AccountForm'
import { DEFAULT_AVATAR_COLOR } from './ColorSwatchPicker'

interface Props {
  account?: Transactions.Account
}

export function AccountDrawer({ account }: Props) {
  const { opened, close, reject } = useDrawerContext<Transactions.Account | void>()
  const { invalidate } = useAccounts()

  const { mutation: createMutation } = useCreateAccount()
  const { mutation: updateMutation } = useUpdateAccount({
    onSuccess: async () => { await invalidate(); close() },
  })

  const isPending = createMutation.isPending || updateMutation.isPending
  const error = (createMutation.error ?? updateMutation.error)?.message

  function handleSubmit(values: AccountFormValues) {
    const payload = {
      name: values.name,
      description: values.description || undefined,
      initial_balance: values.initial_balance,
      avatar_background_color: values.avatar_background_color,
    }
    if (account) {
      updateMutation.mutate({ id: account.id, payload })
    } else {
      createMutation.mutate(payload, {
        onSuccess: async (created) => { await invalidate(); close(created) },
      })
    }
  }

  const initialValues = account
    ? { name: account.name, description: account.description ?? '', initial_balance: account.initial_balance, avatar_background_color: account.avatar_background_color ?? DEFAULT_AVATAR_COLOR }
    : undefined

  return (
    <Drawer
      opened={opened}
      onClose={reject}
      title={account ? 'Editar Conta' : 'Nova Conta'}
      position="right"
      size="md"
      data-testid="drawer_account"
    >
      <AccountForm
        initialValues={initialValues}
        onSubmit={handleSubmit}
        isPending={isPending}
        error={error}
      />
    </Drawer>
  )
}
