import { Box, Text } from '@mantine/core'
import { Fragment } from 'react'
import { Transactions } from '@/types/transactions'
import { SettlementRow } from './SettlementRow'
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
          <Fragment key={tx.id}>
            <TransactionRow
              transaction={tx}
              groupBy={groupBy}
              accounts={accounts}
              categories={categories}
              currentUserId={currentUserId}
            />
            {(tx.settlements_from_source ?? []).map((s) => (
              <SettlementRow
                key={`settlement-${s.id}`}
                settlement={s}
                groupBy={groupBy}
                accounts={accounts}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </Box>
  )
}
