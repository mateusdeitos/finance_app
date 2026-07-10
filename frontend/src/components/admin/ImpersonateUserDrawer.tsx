import { useState } from 'react'
import { Alert, Group, Loader, Stack, Text, TextInput, UnstyledButton } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { ResponsiveDrawer } from '@/components/ResponsiveDrawer'
import { UserAvatar } from '@/components/UserAvatar'
import { useDrawerContext } from '@/utils/renderDrawer'
import { useAdminUsers } from '@/hooks/useAdminUsers'
import { useImpersonation } from '@/hooks/useImpersonation'
import type { AdminUser } from '@/api/admin'
import type { ApiErrorResponse } from '@/utils/apiErrors'
import { AdminTestIds } from '@/testIds'

/**
 * Admin-only drawer to pick a user and start impersonating them. Requires a
 * reason (recorded server-side in the audit trail). Admins are shown but not
 * selectable — the backend refuses to impersonate another admin.
 */
export function ImpersonateUserDrawer() {
  const { opened, close, reject } = useDrawerContext<void>()
  const { start } = useImpersonation()

  const [search, setSearch] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()
  const [pendingUserId, setPendingUserId] = useState<number>()

  const { query } = useAdminUsers(search, { enabled: opened })
  const users = query.data ?? []

  async function handlePick(user: AdminUser) {
    if (user.is_admin) return
    if (reason.trim() === '') {
      setError('Informe um motivo para a impersonação.')
      return
    }
    setError(undefined)
    setPendingUserId(user.id)
    try {
      await start(user.id, reason.trim())
      close()
    } catch (e) {
      const apiError = e as Partial<ApiErrorResponse>
      setError(apiError?.message || 'Não foi possível iniciar a impersonação.')
      setPendingUserId(undefined)
    }
  }

  return (
    <ResponsiveDrawer
      opened={opened}
      onClose={reject}
      title="Impersonar usuário"
      data-testid={AdminTestIds.DrawerImpersonate}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Você agirá como o usuário selecionado (leitura e escrita) até encerrar a sessão. Toda ação
          fica registrada em seu nome.
        </Text>

        {error && (
          <Alert color="red" variant="light" data-testid={AdminTestIds.ImpersonateError}>
            {error}
          </Alert>
        )}

        <TextInput
          label="Motivo"
          placeholder="Ex.: investigar saldo divergente do relatório #123"
          required
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          data-testid={AdminTestIds.ImpersonateReasonInput}
        />

        <TextInput
          label="Buscar usuário"
          placeholder="Nome ou e-mail"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          data-testid={AdminTestIds.ImpersonateSearchInput}
        />

        {query.isLoading ? (
          <Group justify="center" py="md">
            <Loader size="sm" />
          </Group>
        ) : users.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="md">
            Nenhum usuário encontrado.
          </Text>
        ) : (
          <Stack gap={4}>
            {users.map((user) => (
              <UnstyledButton
                key={user.id}
                onClick={() => void handlePick(user)}
                disabled={user.is_admin || pendingUserId !== undefined}
                data-testid={AdminTestIds.ImpersonateUserRow(user.id)}
                style={{
                  padding: 'var(--mantine-spacing-xs)',
                  borderRadius: 'var(--mantine-radius-sm)',
                  opacity: user.is_admin ? 0.5 : 1,
                  cursor: user.is_admin ? 'not-allowed' : 'pointer',
                }}
              >
                <Group gap="sm" wrap="nowrap">
                  <UserAvatar name={user.name} avatarUrl={user.avatar_url} size="sm" />
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={500} truncate>
                      {user.name}
                      {user.is_admin ? ' (admin)' : ''}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {user.email}
                    </Text>
                  </div>
                  {pendingUserId === user.id && <Loader size="xs" ml="auto" />}
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </Stack>
    </ResponsiveDrawer>
  )
}
