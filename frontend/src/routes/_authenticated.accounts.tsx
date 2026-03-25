import { useState } from 'react'
import { Stack, Group, Button, Text, Skeleton } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { createFileRoute } from '@tanstack/react-router'
import { IconPlus } from '@tabler/icons-react'
import { useAccounts } from '@/hooks/useAccounts'
import { useDeleteAccount } from '@/hooks/useDeleteAccount'
import { AccountCard } from '@/components/accounts/AccountCard'
import { AccountDrawer } from '@/components/accounts/AccountDrawer'
import { Transactions } from '@/types/transactions'

export const Route = createFileRoute('/_authenticated/accounts')({
  component: AccountsPage,
})

function AccountsPage() {
  const { query, invalidate } = useAccounts()
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] = useDisclosure(false)
  const [editing, setEditing] = useState<Transactions.Account | undefined>()

  const { mutation: deleteMutation } = useDeleteAccount({ onSuccess: invalidate })

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
  const ownAccounts = accounts.filter((a) => !a.user_connection)
  const sharedAccounts = accounts.filter((a) => !!a.user_connection)

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Text fw={700} size="xl">Contas</Text>
        <Button leftSection={<IconPlus size={16} />} onClick={handleAdd}>
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
          <Stack gap="sm">
            <Text size="sm" fw={600} c="dimmed" tt="uppercase">Minhas contas</Text>
            {ownAccounts.length === 0 ? (
              <Text c="dimmed" ta="center" py="md">Nenhuma conta cadastrada</Text>
            ) : (
              ownAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onEdit={handleEdit}
                  onDelete={(a) => deleteMutation.mutate(a.id)}
                />
              ))
            )}
          </Stack>

          {sharedAccounts.length > 0 && (
            <Stack gap="sm">
              <Text size="sm" fw={600} c="dimmed" tt="uppercase">Contas compartilhadas</Text>
              {sharedAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onEdit={handleEdit}
                  onDelete={(a) => deleteMutation.mutate(a.id)}
                />
              ))}
            </Stack>
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
