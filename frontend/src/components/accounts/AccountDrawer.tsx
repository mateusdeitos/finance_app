import { Drawer } from '@mantine/core'
import { useDrawerContext } from '@/utils/renderDrawer'
import { useAccounts } from '@/hooks/useAccounts'
import { useCreateAccount } from '@/hooks/useCreateAccount'
import { useUpdateAccount } from '@/hooks/useUpdateAccount'
import { Transactions } from '@/types/transactions'
import { AccountForm, AccountFormValues } from './AccountForm'

interface Props {
  account?: Transactions.Account
}

export function AccountDrawer({ account }: Props) {
  const { opened, close, reject } = useDrawerContext<void>()
  const { invalidate } = useAccounts()

  const { mutation: createMutation } = useCreateAccount({
    onSuccess: () => { invalidate(); close() },
  })

  const { mutation: updateMutation } = useUpdateAccount({
    onSuccess: () => { invalidate(); close() },
  })

  const isPending = createMutation.isPending || updateMutation.isPending
  const error = (createMutation.error ?? updateMutation.error)?.message

  function handleSubmit(values: AccountFormValues) {
    const payload = {
      name: values.name,
      description: values.description || undefined,
      initial_balance: values.initial_balance,
    }
    if (account) {
      updateMutation.mutate({ id: account.id, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const initialValues = account
    ? { name: account.name, description: account.description ?? '', initial_balance: account.initial_balance }
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
