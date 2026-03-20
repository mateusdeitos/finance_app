import { Badge, Group, Text, Tooltip } from '@mantine/core'
import { IconLink, IconRepeat, IconUsers } from '@tabler/icons-react'
import { Transactions } from '@/types/transactions'
import { formatCents } from '@/utils/formatCents'
import classes from './TransactionRow.module.css'

const MAX_TAGS = 3

interface TransactionRowProps {
  transaction: Transactions.Transaction
  groupBy: Transactions.GroupBy
  accounts: Transactions.Account[]
  categories: Transactions.Category[]
  currentUserId: number
}

export function TransactionRow({
  transaction: tx,
  groupBy,
  accounts,
  categories,
  currentUserId,
}: TransactionRowProps) {
  const account = accounts.find((a) => a.id === tx.account_id)
  const category = tx.category_id ? categories.find((c) => c.id === tx.category_id) : null
  const tags = tx.tags ?? []
  const visibleTags = tags.slice(0, MAX_TAGS)
  const extraTags = tags.length - MAX_TAGS

  const hasRecurrence = !!tx.transaction_recurrence_id
  const hasLinkedUser = (tx.linked_transactions ?? []).some((l) => l.user_id !== currentUserId)
  const hasSettlement = (tx.settlements_from_source ?? []).length > 0

  const date = new Date(tx.date)
  const dateLabel = date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  return (
    <div className={classes.row}>
      {/* Col 1: date + description + tags */}
      <div className={classes.main}>
        {groupBy !== 'date' && (
          <Text size="xs" c="dimmed">
            {dateLabel}
          </Text>
        )}
        <Group gap={4} wrap="nowrap">
          <Text size="sm" fw={500} lineClamp={1}>
            {tx.description}
          </Text>
          {hasRecurrence && (
            <Tooltip label="Recorrente">
              <IconRepeat size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
            </Tooltip>
          )}
          {hasLinkedUser && (
            <Tooltip label="Compartilhada">
              <IconUsers size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
            </Tooltip>
          )}
          {hasSettlement && (
            <Tooltip label="Origem de acerto">
              <IconLink size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
            </Tooltip>
          )}
        </Group>
        {tags.length > 0 && (
          <Group gap={4} mt={2}>
            {visibleTags.map((tag) => (
              <Badge key={tag.id} size="xs" variant="outline" radius="sm">
                {tag.name}
              </Badge>
            ))}
            {extraTags > 0 && (
              <Text size="xs" c="dimmed">
                (...)
              </Text>
            )}
          </Group>
        )}
      </div>

      {/* Col 2: category */}
      {groupBy !== 'category' && (
        <div className={classes.category}>
          <Text size="sm" c="dimmed" lineClamp={1}>
            {category?.name ?? '—'}
          </Text>
        </div>
      )}

      {/* Col 3: account */}
      {groupBy !== 'account' && (
        <div className={classes.account}>
          <Text size="sm" c="dimmed" lineClamp={1}>
            {account?.name ?? '—'}
          </Text>
        </div>
      )}

      {/* Col 4: amount */}
      <div className={classes.amount}>
        <Text
          size="sm"
          fw={600}
          c={tx.operation_type === 'credit' ? 'teal' : 'red'}
        >
          {formatCents(tx.amount, tx.operation_type)}
        </Text>
      </div>
    </div>
  )
}
