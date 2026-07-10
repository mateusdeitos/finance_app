import { Card, Group, Text, ActionIcon, Badge, Stack } from '@mantine/core'
import {
  IconPencil,
  IconTrash,
  IconRefresh,
  IconArchive,
  IconChevronUp,
  IconChevronDown,
} from '@tabler/icons-react'
import { Transactions } from '@/types/transactions'
import { formatBalance } from '@/utils/formatCents'
import { AccountAvatar } from '@/components/AccountAvatar'
import { AccountsTestIds } from '@/testIds'

interface Props {
  account: Transactions.Account
  onEdit?: (account: Transactions.Account) => void
  onDeactivate?: (account: Transactions.Account) => void
  onActivate?: (account: Transactions.Account) => void
  onDelete?: (account: Transactions.Account) => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
}

export function AccountCard({
  account,
  onEdit,
  onDeactivate,
  onActivate,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: Props) {
  const isShared = !!account.user_connection
  const reorderable = !isShared && account.is_active && (!!onMoveUp || !!onMoveDown)

  return (
    <Card withBorder radius="md" p="md" data-account-name={account.name} data-testid={AccountsTestIds.Card}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4}>
          <Group gap="sm">
            <AccountAvatar account={account} size="md" />
            <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
              <Text fw={600}>{account.name}</Text>
              {isShared && <Badge size="xs" variant="light" color="grape">Compartilhada</Badge>}
            </Group>
          </Group>
          {account.description && (
            <Text size="sm" c="dimmed">{account.description}</Text>
          )}
          <Text size="sm" c={account.initial_balance >= 0 ? 'teal' : 'red'}>
            Saldo inicial: {formatBalance(account.initial_balance)}
          </Text>
        </Stack>

        <Group gap="xs" wrap="nowrap">
          {reorderable && (
            <Stack gap={2}>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                disabled={!canMoveUp}
                onClick={onMoveUp}
                aria-label="Mover para cima"
                data-testid={AccountsTestIds.BtnMoveUp}
              >
                <IconChevronUp size={16} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                disabled={!canMoveDown}
                onClick={onMoveDown}
                aria-label="Mover para baixo"
                data-testid={AccountsTestIds.BtnMoveDown}
              >
                <IconChevronDown size={16} />
              </ActionIcon>
            </Stack>
          )}

          {onEdit && account.is_active && (
            <ActionIcon variant="subtle" color="gray" onClick={() => onEdit(account)} data-testid={AccountsTestIds.BtnEdit}>
              <IconPencil size={16} />
            </ActionIcon>
          )}

          {onActivate && !account.is_active && (
            <ActionIcon
              variant="subtle"
              color="teal"
              onClick={() => onActivate(account)}
              aria-label="Reativar conta"
              data-testid={AccountsTestIds.BtnActivate}
            >
              <IconRefresh size={16} />
            </ActionIcon>
          )}

          {onDeactivate && account.is_active && (
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => onDeactivate(account)}
              aria-label="Inativar conta"
              data-testid={AccountsTestIds.BtnDeactivate}
            >
              <IconArchive size={16} />
            </ActionIcon>
          )}

          {onDelete && (
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={() => onDelete(account)}
              aria-label="Excluir conta"
              data-testid={AccountsTestIds.BtnDelete}
            >
              <IconTrash size={16} />
            </ActionIcon>
          )}
        </Group>
      </Group>
    </Card>
  )
}
