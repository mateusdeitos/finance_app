import { Badge, Center, Divider, Group, Loader, Stack, Text } from '@mantine/core'
import { formatBalance, formatCents } from '@/utils/formatCents'
import { Transactions } from '@/types/transactions'
import { DashboardCard } from './DashboardCard'
import { HomeTestIds } from '@/testIds'

interface Props {
  title: string
  transactions: Transactions.Transaction[]
  total: number
  isLoading: boolean
  emptyLabel: string
  testId: string
  totalTestId: string
}

export function RecurringTransactionsCard({
  title,
  transactions,
  total,
  isLoading,
  emptyLabel,
  testId,
  totalTestId,
}: Props) {
  return (
    <DashboardCard
      title={title}
      testId={testId}
      action={transactions.length > 0 ? <Badge variant="light" color="gray">{transactions.length}</Badge> : undefined}
    >
      {isLoading ? (
        <Center py="md"><Loader size="sm" /></Center>
      ) : transactions.length === 0 ? (
        <Text c="dimmed" ta="center" py="sm">{emptyLabel}</Text>
      ) : (
        <Stack gap="xs">
          {transactions.map((t) => (
            <Group
              key={t.id}
              justify="space-between"
              wrap="nowrap"
              gap="sm"
              data-testid={HomeTestIds.RecurringRow(t.id)}
            >
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={500} truncate>{t.description}</Text>
                <Text size="xs" c="dimmed">
                  Parcela {t.installment_number}/{t.transaction_recurrence?.installments}
                </Text>
              </div>
              <Text size="sm" fw={600} c={t.operation_type === 'credit' ? 'teal' : 'red'} style={{ whiteSpace: 'nowrap' }}>
                {formatCents(t.amount, t.operation_type)}
              </Text>
            </Group>
          ))}
          <Divider />
          <Group justify="space-between">
            <Text size="sm" fw={700}>Total</Text>
            <Text size="sm" fw={700} c={total >= 0 ? 'teal' : 'red'} data-testid={totalTestId}>{formatBalance(total)}</Text>
          </Group>
        </Stack>
      )}
    </DashboardCard>
  )
}
