import { Group, Skeleton, Table, Text } from '@mantine/core'
import { useBalance } from '@/hooks/useBalance'
import { AccountAvatar } from '@/components/AccountAvatar'
import { formatBalance } from '@/utils/formatCents'
import { Transactions } from '@/types/transactions'
import { HomeTestIds } from '@/testIds'
import classes from './AccountBalanceRow.module.css'

interface Props {
  account: Transactions.Account
  month: number
  year: number
  accumulated: boolean
  onSelect: (accountId: number) => void
}

export function AccountBalanceRow({ account, month, year, accumulated, onSelect }: Props) {
  const { query } = useBalance(
    { month, year, accumulated, accountIds: [account.id] },
    (data) => data.balance,
  )

  const balance = query.data

  return (
    <Table.Tr
      className={classes.row}
      onClick={() => onSelect(account.id)}
      data-testid={HomeTestIds.AccountRow(account.id)}
    >
      <Table.Td>
        <Group gap="sm" wrap="nowrap">
          <AccountAvatar account={account} size="md" />
          <div style={{ minWidth: 0 }}>
            <Text fw={600} truncate>{account.name}</Text>
            {account.description && (
              <Text size="xs" c="dimmed" truncate>{account.description}</Text>
            )}
          </div>
        </Group>
      </Table.Td>
      <Table.Td className={classes.amountCell}>
        {query.isLoading || balance === undefined ? (
          <Skeleton height={18} width={90} ml="auto" />
        ) : (
          <Text fw={600} c={balance >= 0 ? 'teal' : 'red'}>
            {formatBalance(balance)}
          </Text>
        )}
      </Table.Td>
    </Table.Tr>
  )
}
