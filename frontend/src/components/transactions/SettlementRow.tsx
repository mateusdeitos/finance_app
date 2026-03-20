import { Badge, Group, Text } from '@mantine/core'
import { IconReceipt } from '@tabler/icons-react'
import { Transactions } from '@/types/transactions'
import { formatCents } from '@/utils/formatCents'
import classes from './TransactionRow.module.css'
import settlementClasses from './SettlementRow.module.css'

interface SettlementRowProps {
  settlement: Transactions.Settlement
  groupBy: Transactions.GroupBy
  accounts: Transactions.Account[]
}

export function SettlementRow({ settlement, groupBy, accounts }: SettlementRowProps) {
  const account = accounts.find((a) => a.id === settlement.account_id)

  const date = settlement.created_at ? new Date(settlement.created_at) : null
  const dateLabel = date?.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  return (
    <div className={`${classes.row} ${settlementClasses.row}`}>
      <div className={classes.main}>
        {groupBy !== 'date' && dateLabel && (
          <Text size="xs" c="dimmed">{dateLabel}</Text>
        )}
        <Group gap={6} wrap="nowrap">
          <IconReceipt size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
          <Text size="sm" fw={500}>Acerto</Text>
          <Badge size="xs" variant="light" color="violet" radius="sm">acerto</Badge>
        </Group>
      </div>

      {groupBy !== 'category' && (
        <div className={classes.category}>
          <Text size="sm" c="dimmed">—</Text>
        </div>
      )}

      {groupBy !== 'account' && (
        <div className={classes.account}>
          <Text size="sm" c="dimmed" lineClamp={1}>{account?.name ?? '—'}</Text>
        </div>
      )}

      <div className={classes.amount}>
        <Text size="sm" fw={600} c={settlement.type === 'credit' ? 'teal' : 'red'}>
          {formatCents(settlement.amount, settlement.type)}
        </Text>
      </div>
    </div>
  )
}
