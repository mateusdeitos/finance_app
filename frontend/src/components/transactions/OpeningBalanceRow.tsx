import { Skeleton, Stack, Switch, Text } from '@mantine/core'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useOpeningBalance } from '@/hooks/useOpeningBalance'
import { formatBalance } from '@/utils/formatCents'
import classes from './TransactionGroup.module.css'

export function OpeningBalanceRow() {
  const search = useSearch({ from: '/_authenticated/transactions' })
  const navigate = useNavigate({ from: '/transactions' })

  const { query: balanceQuery } = useOpeningBalance({
    month: search.month,
    year: search.year,
    accumulated: search.accumulated,
  })

  const balance = balanceQuery.data?.balance ?? 0

  function toggleAccumulated(value: boolean) {
    navigate({ search: (prev) => ({ ...prev, accumulated: value }) })
  }

  return (
    <div className={classes.balanceRow}>
      <Text size="xs" c="dimmed">Saldo anterior</Text>
      <Stack gap={2} align="flex-end">
        {balanceQuery.isLoading ? (
          <Skeleton height={16} width={100} radius="sm" />
        ) : (
          <Text size="xs" fw={500} c={balance < 0 ? 'red' : 'teal'}>
            {formatBalance(balance)}
          </Text>
        )}
        <Switch
          size="xs"
          label="Acumulado"
          checked={search.accumulated}
          onChange={(e) => toggleAccumulated(e.currentTarget.checked)}
        />
      </Stack>
    </div>
  )
}
