import { Card, Group, Text, ActionIcon, Badge, Stack } from '@mantine/core'
import { IconPencil, IconTrash, IconRefresh } from '@tabler/icons-react'
import { Transactions } from '@/types/transactions'
import { formatBalance } from '@/utils/formatCents'

interface Props {
  account: Transactions.Account
  onEdit: (account: Transactions.Account) => void
  onDelete: (account: Transactions.Account) => void
}

export function AccountCard({ account, onEdit, onDelete }: Props) {
  const isShared = !!account.user_connection

  return (
    <Card withBorder radius="md" p="md" data-account-name={account.name} data-testid="account_card">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4}>
          <Group gap="xs">
            <Text fw={600}>{account.name}</Text>
            {isShared && <Badge size="xs" variant="light" color="grape">Compartilhada</Badge>}
          </Group>
          {account.description && (
            <Text size="sm" c="dimmed">{account.description}</Text>
          )}
          <Text size="sm" c={account.initial_balance >= 0 ? 'teal' : 'red'}>
            Saldo inicial: {formatBalance(account.initial_balance)}
          </Text>
        </Stack>

        {!isShared && (
          <Group gap="xs" wrap="nowrap">
            {account.is_active && (
              <ActionIcon variant="subtle" color="gray" onClick={() => onEdit(account)} data-testid="btn_account_edit">
                <IconPencil size={16} />
              </ActionIcon>
            )}
            <ActionIcon
              variant="subtle"
              color={account.is_active ? 'red' : 'teal'}
              onClick={() => onDelete(account)}
              data-testid="btn_account_action"
            >
              {account.is_active ? <IconTrash size={16} /> : <IconRefresh size={16} />}
            </ActionIcon>
          </Group>
        )}
      </Group>
    </Card>
  )
}
