import { Drawer } from '@mantine/core'
import { useDrawerContext } from '@/utils/renderDrawer'
import { useAccounts } from '@/hooks/useAccounts'
import { useCreateAccount } from '@/hooks/useCreateAccount'
import { AccountForm, AccountFormValues } from '@/components/accounts/AccountForm'

export function CreateAccountDrawer() {
  const { opened, close, reject } = useDrawerContext<void>()
  const { invalidate } = useAccounts()
  const { mutation } = useCreateAccount({
    onSuccess: () => { invalidate(); close() },
  })

  function handleSubmit(values: AccountFormValues) {
    mutation.mutate({
      name: values.name,
      description: values.description || undefined,
      initial_balance: values.initial_balance,
    })
  }

  return (
    <Drawer opened={opened} onClose={reject} title="Nova Conta" position="right" size="md">
      <AccountForm
        onSubmit={handleSubmit}
        isPending={mutation.isPending}
        error={mutation.error?.message}
      />
    </Drawer>
  )
}
