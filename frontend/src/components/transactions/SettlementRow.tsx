import { Badge, Group, Text, Tooltip } from '@mantine/core'
import { IconReceipt } from '@tabler/icons-react'
import { AccountAvatar } from '@/components/AccountAvatar'
import { Transactions } from '@/types/transactions'
import { formatCents } from '@/utils/formatCents'
import classes from './TransactionRow.module.css'
import settlementClasses from './SettlementRow.module.css'

interface SettlementRowProps {
  settlement: Transactions.Settlement
  groupBy: Transactions.GroupBy
  accounts: Transactions.Account[]
  onEdit?: () => void
  /** When provided, shown as the main label instead of the generic "Acerto". */
  description?: string
}

export function SettlementRow({ settlement, groupBy, accounts, onEdit, description }: SettlementRowProps) {
  const account = accounts.find((a) => a.id === settlement.account_id)

  const date = settlement.created_at ? new Date(settlement.created_at) : null
  const dateLabel = date?.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  return (
    <div
      className={`${classes.row} ${settlementClasses.row}${onEdit ? ` ${classes.editable}` : ''}`}
      onClick={onEdit}
    >
      {/* Col 1: empty checkbox placeholder to align with TransactionRow grid */}
      <div className={classes.checkbox} />

      <div className={classes.main}>
        {groupBy !== 'date' && dateLabel && (
          <Text size="xs" c="dimmed">{dateLabel}</Text>
        )}
        <Group gap={6} wrap="nowrap">
          <IconReceipt size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
          <Text size="sm" fw={500} lineClamp={1}>{description ?? 'Acerto'}</Text>
          <Badge size="xs" variant="light" color="violet" radius="sm">acerto</Badge>
        </Group>
      </div>

      <div className={classes.category} />

      <div className={classes.account}>
        {groupBy !== 'account' && (
          <Tooltip label={account?.name ?? "\u2014"} withArrow position="top">
            <span>
              <AccountAvatar account={account} size="xs" />
            </span>
          </Tooltip>
        )}
      </div>

      <div className={classes.amount}>
        <Text size="sm" fw={600} c={settlement.type === 'credit' ? 'teal' : 'red'}>
          {formatCents(settlement.amount, settlement.type)}
        </Text>
      </div>
    </div>
  )
}
