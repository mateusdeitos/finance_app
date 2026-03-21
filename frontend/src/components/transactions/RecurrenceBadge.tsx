import { Group, Text, Tooltip } from '@mantine/core'
import { IconRepeat } from '@tabler/icons-react'
import { Transactions } from '@/types/transactions'

interface RecurrenceBadgeProps {
  transaction: Transactions.Transaction
}

export function RecurrenceBadge({ transaction: tx }: RecurrenceBadgeProps) {
  if (!tx.transaction_recurrence_id) return null

  return (
    <Tooltip label="Recorrente">
      <Group gap={2} wrap="nowrap" style={{ flexShrink: 0, opacity: 0.6 }}>
        <IconRepeat size={14} style={{ flexShrink: 0 }} />
        {tx.installment_number != null && tx.transaction_recurrence && (
          <Text size="xs" style={{ whiteSpace: 'nowrap' }}>
            {tx.installment_number}/{tx.transaction_recurrence.installments}
          </Text>
        )}
      </Group>
    </Tooltip>
  )
}
