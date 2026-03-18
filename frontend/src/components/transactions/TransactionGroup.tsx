import { Box, Text } from '@mantine/core'
import { Transactions } from '@/types/transactions'
import { TransactionRow } from './TransactionRow'
import classes from './TransactionGroup.module.css'

interface TransactionGroupProps {
  group: Transactions.TransactionGroup
  groupBy: Transactions.GroupBy
  accounts: Transactions.Account[]
  categories: Transactions.Category[]
  currentUserId: number
}

export function TransactionGroup({
  group,
  groupBy,
  accounts,
  categories,
  currentUserId,
}: TransactionGroupProps) {
  return (
    <Box className={classes.group}>
      <Text size="xs" fw={600} c="dimmed" tt="uppercase" className={classes.header}>
        {group.label}
      </Text>
      <div className={classes.rows}>
        {group.transactions.map((tx) => (
          <TransactionRow
            key={tx.id}
            transaction={tx}
            groupBy={groupBy}
            accounts={accounts}
            categories={categories}
            currentUserId={currentUserId}
          />
        ))}
      </div>
    </Box>
  )
}
