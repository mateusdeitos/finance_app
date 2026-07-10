import { Stack, Group, Button, Text, Skeleton } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { useAccounts } from '@/hooks/useAccounts'
import { useActivateAccount } from '@/hooks/useActivateAccount'
import { useDeactivateAccount } from '@/hooks/useDeactivateAccount'
import { useDeleteAccount } from '@/hooks/useDeleteAccount'
import { useReorderAccounts } from '@/hooks/useReorderAccounts'
import { useAccountDeletionInfo } from '@/hooks/useAccountDeletionInfo'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useHotkey } from '@/hooks/useHotkey'
import { AccountDrawer } from '@/components/accounts/AccountDrawer'
import { DeleteAccountDrawer } from '@/components/accounts/DeleteAccountDrawer'
import { EditConnectionDrawer } from '@/components/connections/EditConnectionDrawer'
import { AccountSection } from '@/components/accounts/AccountSection'
import { Fab } from '@/components/Fab'
import { PullToRefresh } from '@/components/PullToRefresh'
import { ShortcutHint } from '@/components/ShortcutHint'
import { renderDrawer } from '@/utils/renderDrawer'
import { Transactions } from '@/types/transactions'
import { AccountsTestIds } from '@/testIds'

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

  const { mutation: deactivateMutation } = useDeactivateAccount({ onSuccess: invalidate })
  const { mutation: activateMutation } = useActivateAccount({ onSuccess: invalidate })
  const { mutation: deleteMutation } = useDeleteAccount({ onSuccess: invalidate })
  const { mutation: reorderMutation } = useReorderAccounts({ onSuccess: invalidate })
  const { fetchInfo } = useAccountDeletionInfo()

  function handleEdit(account: Transactions.Account) {
    if (account.user_connection) {
      void renderDrawer(() => <EditConnectionDrawer account={account} />)
    } else {
      void renderDrawer(() => <AccountDrawer account={account} />)
    }
  }

  async function handleDelete(account: Transactions.Account) {
    const info = await fetchInfo(account.id)
    if (info.transaction_count === 0) {
      deleteMutation.mutate({ id: account.id })
      return
    }
    await renderDrawer<'confirmed' | void>(() => (
      <DeleteAccountDrawer account={account} transactionCount={info.transaction_count} />
    )).catch(() => undefined)
  }

  function handleReorder(orderedIds: number[]) {
    reorderMutation.mutate(orderedIds)
  }

  function handleAdd() {
    void renderDrawer(() => <AccountDrawer />)
  }

  useHotkey('n', handleAdd)

  const hasAccounts = (query.data?.length ?? 0) > 0
  const isMobile = useIsMobile()

  return (
    <PullToRefresh onRefresh={invalidate}>
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Text fw={700} size="xl">Contas</Text>
        {!isMobile && (
          <Button
            leftSection={<IconPlus size={16} />}
            rightSection={<ShortcutHint keys={['N']} />}
            onClick={handleAdd}
            data-testid={AccountsTestIds.BtnNew}
          >
            Nova Conta
          </Button>
        )}
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
            onDeactivate={(a) => deactivateMutation.mutate(a.id)}
            onDelete={handleDelete}
            onReorder={handleReorder}
            testId={AccountsTestIds.SectionActive}
          />
          <AccountSection
            label="Contas compartilhadas"
            accounts={activeSharedQuery.data ?? []}
            onEdit={handleEdit}
          />
          <AccountSection
            label="Inativas"
            accounts={inactiveQuery.data ?? []}
            onActivate={(a) => activateMutation.mutate(a.id)}
            onDelete={handleDelete}
            testId={AccountsTestIds.SectionInactive}
          />
          {!hasAccounts && (
            <Text c="dimmed" ta="center" py="md">Nenhuma conta cadastrada</Text>
          )}
        </Stack>
      )}

    </Stack>

    {isMobile && (
      <Fab onClick={handleAdd} ariaLabel="Nova Conta" testId={AccountsTestIds.BtnNew}>
        <IconPlus size={24} stroke={2.2} />
      </Fab>
    )}
    </PullToRefresh>
  )
}
