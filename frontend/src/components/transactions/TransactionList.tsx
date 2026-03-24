import { Skeleton, Stack, Text } from '@mantine/core'
import { useSearch } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useActiveFilters } from '@/hooks/useActiveFilters'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { useOpeningBalance } from '@/hooks/useOpeningBalance'
import { useTransactions } from '@/hooks/useTransactions'
import { Transactions } from '@/types/transactions'
import { groupTransactions } from '@/utils/groupTransactions'
import { TransactionGroup } from './TransactionGroup'

interface TransactionListProps {
  currentUserId: number
}

function groupNetTotal(group: Transactions.TransactionGroup): number {
  return group.transactions.reduce((sum, tx) => {
    return sum + (tx.operation_type === 'credit' ? tx.amount : -tx.amount)
  }, 0)
}

export function TransactionList({ currentUserId }: TransactionListProps) {
  const search = useSearch({ from: '/_authenticated/transactions' })
  const filters = useActiveFilters()

  const { query: txQuery } = useTransactions({
    month: search.month,
    year: search.year,
    ...filters,
  })
  const { query: balanceQuery } = useOpeningBalance({
    month: search.month,
    year: search.year,
    accumulated: search.accumulated,
  })

  const { query: accountsQuery } = useAccounts()
  const { query: categoriesQuery } = useCategories()
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data])
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])

  const openingBalance = balanceQuery.data?.balance ?? 0

  const filtered = useMemo(() => {
    const transactions = txQuery.data ?? []
    if (!search.query) return transactions
    const lower = search.query.toLowerCase()
    return transactions.filter((tx) => tx.description.toLowerCase().includes(lower))
  }, [txQuery.data, search.query])

  const groups = useMemo(
    () => groupTransactions(filtered, search.groupBy, accounts, categories),
    [filtered, search.groupBy, accounts, categories],
  )

  const groupTotals = useMemo(() => groups.map(groupNetTotal), [groups])

  const runningBalances = useMemo(() => {
    return groupTotals.reduce<number[]>((acc, total) => {
      const prev = acc.length > 0 ? acc[acc.length - 1] : openingBalance
      return [...acc, prev + total]
    }, [])
  }, [groupTotals, openingBalance])

  if (txQuery.isLoading) {
    return (
      <Stack gap="sm">
        {Array.from({ length: 3 }).map((_, i) => (
          <Stack key={i} gap={4}>
            <Skeleton height={28} radius="sm" />
            <Skeleton height={48} radius="sm" />
            <Skeleton height={48} radius="sm" />
            <Skeleton height={48} radius="sm" />
          </Stack>
        ))}
      </Stack>
    )
  }

  if (groups.length === 0) {
    return (
      <Text ta="center" c="dimmed" py="xl">
        Nenhuma transação encontrada
      </Text>
    )
  }

  return (
    <Stack gap="sm">
      {groups.map((group, i) => (
        <TransactionGroup
          key={group.key}
          group={group}
          groupBy={search.groupBy}
          accounts={accounts}
          categories={categories}
          currentUserId={currentUserId}
          groupTotal={groupTotals[i]}
          runningBalance={runningBalances[i]}
          isFirst={i === 0}
        />
      ))}
    </Stack>
  )
}
