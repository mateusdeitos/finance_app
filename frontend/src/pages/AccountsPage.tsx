import { Stack, Group, Button, Text, Skeleton } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { useAccounts } from '@/hooks/useAccounts'
import { useActivateAccount } from '@/hooks/useActivateAccount'
import { useDeleteAccount } from '@/hooks/useDeleteAccount'
import { AccountDrawer } from '@/components/accounts/AccountDrawer'
import { AccountSection } from '@/components/accounts/AccountSection'
import { renderDrawer } from '@/utils/renderDrawer'
import { Transactions } from '@/types/transactions'

export function AccountsPage() {
  const { query, invalidate } = useAccounts()
  const { query: activeOwnQuery } = useAccounts((accounts) =>
    accounts.filter((a) => a.is_active && !a.user_connection),
  )
  const { query: activeSharedQuery } = useAccounts((accounts) =>
    accounts.filter((a) => a.is_active && !!a.user_connection),
  )
  const { query: inactiveQuery } = useAccounts((accounts) =>
    accounts.filter((a) => !a.is_active),
  )

  const { mutation: deactivateMutation } = useDeleteAccount({ onSuccess: invalidate })
  const { mutation: activateMutation } = useActivateAccount({ onSuccess: invalidate })

  function handleEdit(account: Transactions.Account) {
    void renderDrawer(() => <AccountDrawer account={account} />)
  }

  function handleAdd() {
    void renderDrawer(() => <AccountDrawer />)
  }

  const hasAccounts = (query.data?.length ?? 0) > 0

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
            accounts={activeOwnQuery.data ?? []}
            onEdit={handleEdit}
            onAction={(a) => deactivateMutation.mutate(a.id)}
            testId="section_active"
          />
          <AccountSection
            label="Contas compartilhadas"
            accounts={activeSharedQuery.data ?? []}
            onEdit={handleEdit}
            onAction={(a) => deactivateMutation.mutate(a.id)}
          />
          <AccountSection
            label="Inativas"
            accounts={inactiveQuery.data ?? []}
            onEdit={handleEdit}
            onAction={(a) => activateMutation.mutate(a.id)}
            testId="section_inactive"
          />
          {!hasAccounts && (
            <Text c="dimmed" ta="center" py="md">Nenhuma conta cadastrada</Text>
          )}
        </Stack>
      )}

    </Stack>
  )
}
