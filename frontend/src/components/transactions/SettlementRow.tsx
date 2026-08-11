import { Checkbox, Tooltip } from '@mantine/core'
import { AccountAvatar } from '@/components/AccountAvatar'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useLongPress } from '@/hooks/useLongPress'
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

  // Mirrors TransactionRow: no checkbox on mobile, hold the row to select.
  const longPress = useLongPress(
    () => {
      tapHaptic()
      onSelect?.(settlement.id, false)
    },
    { enabled: isMobile && !selectionMode && !!onSelect },
  )

  // Metadata line: the ACERTO chip leads, then the back-reference to the
  // source transaction and the date as plain dimmed text.
  const metaParts: string[] = []
  if (parentRef) metaParts.push(`de ${parentRef}`)
  if (groupBy !== 'date' && dateLabel) metaParts.push(dateLabel)

  return (
    <div
      data-testid={TransactionsTestIds.SettlementRow(settlement.id)}
      className={`${classes.row}${settlement.reviewed_at ? ` ${classes.reviewed}` : ''}${selectionMode ? ` ${classes.selectable}` : ''}${isSelected ? ` ${classes.selected}` : ''}${!selectionMode && onEdit ? ` ${classes.editable}` : ''}`.trimEnd()}
      onClick={handleRowClick}
      {...longPress}
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
            size="xs"
            data-testid={TransactionsTestIds.CheckboxSettlement(settlement.id)}
          />
        )}
      </div>

      <div className={classes.main}>
        <div className={classes.descLine}>
          <span className={classes.description}>{description ?? 'Acerto'}</span>
          <span
            className={`${classes.amount} ${
              settlement.type === 'credit' ? classes.amountPositive : classes.amountNegative
            }`}
          >
            {formatCents(settlement.amount, settlement.type)}
          </span>
        </div>

        <div className={classes.metaLine}>
          <span className={`${classes.outlineChip} ${classes.statusChip}`}>Acerto</span>
          {metaParts.length > 0 && <span className={classes.metaText}>{metaParts.join(' · ')}</span>}
          {groupBy !== 'account' && (
            <span className={classes.metaItem}>
              <Tooltip label={account?.name ?? '—'} withArrow position="top">
                <span style={{ display: 'inline-flex' }}>
                  <AccountAvatar account={account} size={16} />
                </span>
              </Tooltip>
              <span className={classes.metaText}>{account?.name ?? '—'}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
