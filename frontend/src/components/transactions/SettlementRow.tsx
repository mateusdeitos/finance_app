import { Badge, Checkbox, Group, Text, Tooltip } from '@mantine/core'
import { AccountAvatar } from '@/components/AccountAvatar'
import { useIsMobile } from '@/hooks/useIsMobile'
import { Transactions } from '@/types/transactions'
import { TransactionsTestIds } from '@/testIds'
import { formatCents } from '@/utils/formatCents'
import { tapHaptic } from '@/utils/haptics'
import { parseDate } from '@/utils/parseDate'
import classes from './TransactionRow.module.css'

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
  /** Date of the source transaction this settlement points back to. */
  parentDate?: string
}

function formatParentRef(dateStr: string | undefined): string | null {
  if (!dateStr) return null
  const d = parseDate(dateStr)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
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
  parentDate,
}: SettlementRowProps) {
  const isMobile = useIsMobile()
  const account = accounts.find((a) => a.id === settlement.account_id)
  const selectionMode = isSelectionMode ?? false

  // Prefer the settlement's own date when available; fall back to created_at
  // for older rows that haven't been backfilled in-memory.
  const dateSource = settlement.date ?? settlement.created_at
  const date = dateSource ? parseDate(dateSource) : null
  const dateLabel = date?.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const parentRef = formatParentRef(parentDate)

  const handleRowClick = selectionMode
    ? (e: React.MouseEvent) => {
        tapHaptic()
        onSelect?.(settlement.id, e.shiftKey)
      }
    : onEdit

  // Meta line composition: ACERTO chip is always present; the rest of the
  // meta is a single dimmed Text so spacing stays uniform with TransactionRow.
  const metaParts: string[] = []
  if (parentRef) metaParts.push(`de ${parentRef}`)
  if (groupBy !== 'date' && dateLabel) metaParts.push(dateLabel)
  if (isMobile && groupBy !== 'account' && account?.name) metaParts.push(account.name)

  return (
    <div
      data-testid={TransactionsTestIds.SettlementRow(settlement.id)}
      className={`${classes.row}${selectionMode ? ` ${classes.selectable} ${classes.selectionMode}` : ''}${isSelected ? ` ${classes.selected}` : ''}${!selectionMode && onEdit ? ` ${classes.editable}` : ''}`.trimEnd()}
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

      <div className={classes.leadingAvatar}>
        <Tooltip label={account?.name ?? '—'} withArrow position="top">
          <span style={{ display: 'inline-flex' }}>
            <AccountAvatar account={account} size={26} />
          </span>
        </Tooltip>
      </div>

      <div className={classes.main}>
        <Text size="sm" fw={500} lineClamp={2}>
          {description ?? 'Acerto'}
        </Text>
        <Group gap={6} mt={2} wrap="wrap" align="center">
          <Badge
            size="xs"
            variant="light"
            color="violet"
            radius="sm"
            styles={{ root: { letterSpacing: 0.5, fontWeight: 700 } }}
          >
            ACERTO
          </Badge>
          {metaParts.length > 0 && (
            <Text size="xs" c="dimmed">
              {metaParts.join(' · ')}
            </Text>
          )}
        </Group>
      </div>

      <div className={classes.category} />

      <div className={classes.account}>
        {groupBy !== 'account' && (
          <Tooltip label={account?.name ?? '—'} withArrow position="top">
            <span style={{ display: 'inline-flex' }}>
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
