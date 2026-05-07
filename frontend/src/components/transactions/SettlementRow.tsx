import { Badge, Checkbox, Group, Text, Tooltip } from '@mantine/core'
import { IconReceipt } from '@tabler/icons-react'
import { AccountAvatar } from '@/components/AccountAvatar'
import { Transactions } from '@/types/transactions'
import { TransactionsTestIds } from '@/testIds'
import { formatCents } from '@/utils/formatCents'
import { tapHaptic } from '@/utils/haptics'
import classes from './TransactionRow.module.css'
import settlementClasses from './SettlementRow.module.css'

interface SettlementRowProps {
  settlement: Transactions.Settlement
  groupBy: Transactions.GroupBy
  accounts: Transactions.Account[]
  onEdit?: () => void
  /** When provided, shown as the main label instead of the generic "Acerto". */
  description?: string
  isSelected?: boolean
  isSelectionMode?: boolean
  onSelect?: (settlementId: number, shiftKey: boolean) => void
}

export function SettlementRow({
  settlement,
  groupBy,
  accounts,
  onEdit,
  description,
  isSelected,
  isSelectionMode,
  onSelect,
}: SettlementRowProps) {
  const account = accounts.find((a) => a.id === settlement.account_id)
  const selectionMode = isSelectionMode ?? false

  // Prefer the settlement's own date when available (issue #69); fall back to
  // created_at for older rows that haven't been backfilled in-memory.
  const dateSource = settlement.date ?? settlement.created_at
  const date = dateSource ? new Date(dateSource) : null
  const dateLabel = date?.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  const handleRowClick = selectionMode
    ? (e: React.MouseEvent) => {
        tapHaptic()
        onSelect?.(settlement.id, e.shiftKey)
      }
    : onEdit

  return (
    <div
      className={`${classes.row} ${settlementClasses.row}${selectionMode ? ` ${classes.selectable} ${classes.selectionMode}` : ''}${isSelected ? ` ${classes.selected}` : ''}${!selectionMode && onEdit ? ` ${classes.editable}` : ''}`.trimEnd()}
      onClick={handleRowClick}
    >
      <div className={classes.checkbox}>
        {onSelect && (
          <Checkbox
            checked={isSelected ?? false}
            onChange={(e) => {
              tapHaptic()
              onSelect(settlement.id, (e.nativeEvent as MouseEvent).shiftKey)
            }}
            onClick={(e) => e.stopPropagation()}
            size="sm"
            data-testid={TransactionsTestIds.CheckboxSettlement(settlement.id)}
          />
        )}
      </div>

      <div className={classes.main}>
        {groupBy !== 'date' && dateLabel && (
          <Text size="xs" c="dimmed">{dateLabel}</Text>
        )}
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <IconReceipt size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
          <Badge size="xs" variant="light" color="violet" radius="sm" style={{ flexShrink: 0 }}>acerto</Badge>
          <Text size="sm" fw={500} lineClamp={1} style={{ minWidth: 0 }}>{description ?? 'Acerto'}</Text>
        </Group>
      </div>

      <div className={classes.category} />

      <div className={classes.account}>
        {groupBy !== 'account' && (
          <Tooltip label={account?.name ?? "—"} withArrow position="top">
            <span style={{ display: "inline-flex" }}>
              <AccountAvatar account={account} size={28} />
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
