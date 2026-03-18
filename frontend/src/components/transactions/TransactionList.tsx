import { Stack, Text } from '@mantine/core'
import { useMemo } from 'react'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { Transactions } from '@/types/transactions'
import { groupTransactions } from '@/utils/groupTransactions'
import { TransactionGroup } from './TransactionGroup'

interface TransactionListProps {
  transactions: Transactions.Transaction[]
  groupBy: Transactions.GroupBy
  currentUserId: number
  textFilter?: string
}

export function TransactionList({
  transactions,
  groupBy,
  currentUserId,
  textFilter,
}: TransactionListProps) {
  const { query: accountsQuery } = useAccounts()
  const { query: categoriesQuery } = useCategories()
  const accounts = accountsQuery.data ?? []
  const categories = categoriesQuery.data ?? []

  const filtered = useMemo(() => {
    if (!textFilter) return transactions
    const lower = textFilter.toLowerCase()
    return transactions.filter((tx) => tx.description.toLowerCase().includes(lower))
  }, [transactions, textFilter])

  const groups = useMemo(
    () => groupTransactions(filtered, groupBy, accounts, categories),
    [filtered, groupBy, accounts, categories],
  )

  if (groups.length === 0) {
    return (
      <Text ta="center" c="dimmed" py="xl">
        Nenhuma transação encontrada
      </Text>
    )
  }

  return (
    <Stack gap="sm">
      {groups.map((group) => (
        <TransactionGroup
          key={group.key}
          group={group}
          groupBy={groupBy}
          accounts={accounts}
          categories={categories}
          currentUserId={currentUserId}
        />
      ))}
    </Stack>
  )
}
