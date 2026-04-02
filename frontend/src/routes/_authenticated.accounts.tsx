import { useState } from 'react'
import { Stack, Group, Button, Text, Skeleton } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { createFileRoute } from '@tanstack/react-router'
import { IconPlus } from '@tabler/icons-react'
import { useAccounts } from '@/hooks/useAccounts'
import { useActivateAccount } from '@/hooks/useActivateAccount'
import { useDeleteAccount } from '@/hooks/useDeleteAccount'
import { AccountCard } from '@/components/accounts/AccountCard'
import { AccountDrawer } from '@/components/accounts/AccountDrawer'
import { Transactions } from '@/types/transactions'

export const Route = createFileRoute('/_authenticated/accounts')({
  component: AccountsPage,
})

function AccountSection({
  label,
  accounts,
  onEdit,
  onAction,
  testId,
}: {
  label: string
  accounts: Transactions.Account[]
  onEdit: (a: Transactions.Account) => void
  onAction: (a: Transactions.Account) => void
  testId?: string
}) {
  if (accounts.length === 0) return null
  return (
    <Stack gap="sm" data-testid={testId}>
      <Text size="sm" fw={600} c="dimmed" tt="uppercase">{label}</Text>
      {accounts.map((account) => (
        <AccountCard
          key={account.id}
          account={account}
          onEdit={onEdit}
          onDelete={onAction}
        />
      ))}
    </Stack>
  )
}

function AccountsPage() {
  const { query, invalidate } = useAccounts()
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] = useDisclosure(false)
  const [editing, setEditing] = useState<Transactions.Account | undefined>()

  const { mutation: deactivateMutation } = useDeleteAccount({ onSuccess: invalidate })
  const { mutation: activateMutation } = useActivateAccount({ onSuccess: invalidate })

  function handleEdit(account: Transactions.Account) {
    setEditing(account)
    openDrawer()
  }

  function handleAdd() {
    setEditing(undefined)
    openDrawer()
  }

  function handleClose() {
    setEditing(undefined)
    closeDrawer()
  }

  const accounts = query.data ?? []
  const activeOwn      = accounts.filter((a) => a.is_active && !a.user_connection)
  const activeShared   = accounts.filter((a) => a.is_active && !!a.user_connection)
  const inactiveOwn    = accounts.filter((a) => !a.is_active && !a.user_connection)
  const inactiveShared = accounts.filter((a) => !a.is_active && !!a.user_connection)

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Text fw={700} size="xl">Contas</Text>
        <Button leftSection={<IconPlus size={16} />} onClick={handleAdd} data-testid="btn_new_account">
          Nova Conta
        </Button>
      </Group>

      {query.isLoading ? (
        <Stack gap="sm">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={80} radius="md" />
          ))}
        </Stack>
      ) : (
        <Stack gap="xl">
          <AccountSection
            label="Minhas contas"
            accounts={activeOwn}
            onEdit={handleEdit}
            onAction={(a) => deactivateMutation.mutate(a.id)}
            testId="section_active"
          />
          <AccountSection
            label="Contas compartilhadas"
            accounts={activeShared}
            onEdit={handleEdit}
            onAction={(a) => deactivateMutation.mutate(a.id)}
          />
          <AccountSection
            label="Inativas"
            accounts={[...inactiveOwn, ...inactiveShared]}
            onEdit={handleEdit}
            onAction={(a) => activateMutation.mutate(a.id)}
            testId="section_inactive"
          />
          {accounts.length === 0 && (
            <Text c="dimmed" ta="center" py="md">Nenhuma conta cadastrada</Text>
          )}
        </Stack>
      )}

      <AccountDrawer
        opened={drawerOpened}
        onClose={handleClose}
        account={editing}
      />
    </Stack>
  )
}
