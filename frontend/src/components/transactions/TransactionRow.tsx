import { Badge, Group, Stack, Text, Tooltip } from '@mantine/core'
import { IconArrowDown, IconLink, IconRepeat, IconUsers } from '@tabler/icons-react'
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
  const linkedAccount = tx.type === 'transfer' && (tx.linked_transactions ?? []).length > 0
    ? accounts.find((a) => a.id === tx.linked_transactions![0].account_id)
    : null
  const fromAccount = tx.operation_type === 'debit' ? account : linkedAccount
  const toAccount = tx.operation_type === 'debit' ? linkedAccount : account
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
      {(groupBy !== 'account' || tx.type === 'transfer') && (
        <div className={classes.account}>
          {tx.type === 'transfer' ? (
            groupBy === 'account' ? (
              <Text size="sm" c="dimmed" lineClamp={1}>{toAccount?.name ?? '—'}</Text>
            ) : (
              <Stack gap={0}>
                <Text size="sm" c="dimmed" lineClamp={1}>{fromAccount?.name ?? '—'}</Text>
                <IconArrowDown size={12} style={{ opacity: 0.5 }} />
                <Text size="sm" c="dimmed" lineClamp={1}>{toAccount?.name ?? '—'}</Text>
              </Stack>
            )
          ) : (
            <Text size="sm" c="dimmed" lineClamp={1}>
              {account?.name ?? '—'}
            </Text>
          )}
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
