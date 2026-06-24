import { Switch, Table, Text } from '@mantine/core'
import { useAccounts } from '@/hooks/useAccounts'
import { useBalance } from '@/hooks/useBalance'
import { formatBalance } from '@/utils/formatCents'
import { DashboardCard } from './DashboardCard'
import { AccountBalanceRow } from './AccountBalanceRow'
import { HomeTestIds } from '@/testIds'

interface Props {
  month: number
  year: number
  accumulated: boolean
  onAccumulatedChange: (value: boolean) => void
  onSelectAccount: (accountId: number) => void
}

export function AccountBalancesCard({
  month,
  year,
  accumulated,
  onAccumulatedChange,
  onSelectAccount,
}: Props) {
  const { query } = useAccounts((accounts) => accounts.filter((a) => a.is_active))
  const accounts = query.data ?? []
  const accountIds = accounts.map((a) => a.id)

  // The balance endpoint sums across the given account_ids, so a single query
  // over every active account gives the grand total without re-aggregating rows.
  const { query: totalQuery } = useBalance(
    { month, year, accumulated, accountIds },
    (data) => data.balance,
  )
  const total = totalQuery.data

  return (
    <DashboardCard
      title="Saldo das contas"
      testId={HomeTestIds.AccountBalancesSection}
      action={
        <Switch
          size="sm"
          checked={accumulated}
          onChange={(e) => onAccumulatedChange(e.currentTarget.checked)}
          label="Acumulado"
          labelPosition="left"
          data-testid={HomeTestIds.AccumulatedToggle}
        />
      }
    >
      {accounts.length === 0 ? (
        <Text c="dimmed" ta="center" py="sm">Nenhuma conta ativa</Text>
      ) : (
        <Table verticalSpacing="sm" highlightOnHoverColor="transparent">
          <Table.Tbody>
            {accounts.map((account) => (
              <AccountBalanceRow
                key={account.id}
                account={account}
                month={month}
                year={year}
                accumulated={accumulated}
                onSelect={onSelectAccount}
              />
            ))}
          </Table.Tbody>
          {accounts.length > 1 && (
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td>
                  <Text fw={700}>Total</Text>
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  <Text fw={700} c={(total ?? 0) >= 0 ? 'teal' : 'red'} data-testid={HomeTestIds.AccountBalancesTotal}>
                    {total === undefined ? '—' : formatBalance(total)}
                  </Text>
                </Table.Td>
              </Table.Tr>
            </Table.Tfoot>
          )}
        </Table>
      )}
    </DashboardCard>
  )
}
