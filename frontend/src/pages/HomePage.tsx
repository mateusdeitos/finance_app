import { Suspense, lazy } from 'react'
import { Center, Group, Loader, SimpleGrid, Stack, Text } from '@mantine/core'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { PeriodNavigator } from '@/components/transactions/PeriodNavigator'
import { AccountBalancesCard } from '@/components/home/AccountBalancesCard'
import { RecurringTransactionsCard } from '@/components/home/RecurringTransactionsCard'

// The chart cards pull in recharts; lazy-load them so it splits into its own
// chunk instead of bloating the main bundle served on every route.
const ExpenseDonutCard = lazy(() =>
  import('@/components/home/ExpenseDonutCard').then((m) => ({ default: m.ExpenseDonutCard })),
)
const IncomeSankeyCard = lazy(() =>
  import('@/components/home/IncomeSankeyCard').then((m) => ({ default: m.IncomeSankeyCard })),
)

function ChartFallback() {
  return <Center h={280}><Loader size="sm" /></Center>
}
import { useRecurringForPeriod } from '@/hooks/useRecurringForPeriod'
import { PullToRefresh } from '@/components/PullToRefresh'
import { QueryKeys } from '@/utils/queryKeys'
import { HomeTestIds } from '@/testIds'

export function HomePage() {
  const { month, year, accumulated, hideSettlements } = useSearch({ from: '/_authenticated/home' })
  const navigate = useNavigate({ from: '/home' })
  const queryClient = useQueryClient()

  const recurring = useRecurringForPeriod(month, year)

  const setPeriod = (m: number, y: number) =>
    navigate({ search: (prev) => ({ ...prev, month: m, year: y }) })

  const setAccumulated = (value: boolean) =>
    navigate({ search: (prev) => ({ ...prev, accumulated: value }) })

  const setHideSettlements = (value: boolean) =>
    navigate({ search: (prev) => ({ ...prev, hideSettlements: value }) })

  const goToAccount = (accountId: number) =>
    navigate({ to: '/transactions', search: { accountIds: [accountId], month, year } })

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Balance] }),
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Transactions] }),
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Accounts] }),
      queryClient.invalidateQueries({ queryKey: [QueryKeys.Categories] }),
    ])

  return (
    <PullToRefresh onRefresh={refresh}>
      <Stack gap="md" data-testid={HomeTestIds.Page}>
        <Group justify="space-between" align="center" wrap="nowrap">
          <Text fw={700} size="xl">Início</Text>
          <div data-testid={HomeTestIds.PeriodNavigator}>
            <PeriodNavigator month={month} year={year} onPeriodChange={setPeriod} />
          </div>
        </Group>

        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          <AccountBalancesCard
            month={month}
            year={year}
            accumulated={accumulated}
            onAccumulatedChange={setAccumulated}
            onSelectAccount={goToAccount}
          />
          <Suspense fallback={<ChartFallback />}>
            <ExpenseDonutCard
              month={month}
              year={year}
              hideSettlements={hideSettlements}
              onHideSettlementsChange={setHideSettlements}
            />
          </Suspense>
        </SimpleGrid>

        <Suspense fallback={<ChartFallback />}>
          <IncomeSankeyCard month={month} year={year} />
        </Suspense>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <RecurringTransactionsCard
            title="Recorrentes iniciando"
            transactions={recurring.starting}
            total={recurring.startingTotal}
            isLoading={recurring.isLoading}
            emptyLabel="Nenhuma recorrência inicia neste período"
            testId={HomeTestIds.RecurringStartingSection}
            totalTestId={HomeTestIds.RecurringStartingTotal}
          />
          <RecurringTransactionsCard
            title="Recorrentes finalizando"
            transactions={recurring.ending}
            total={recurring.endingTotal}
            isLoading={recurring.isLoading}
            emptyLabel="Nenhuma recorrência finaliza neste período"
            testId={HomeTestIds.RecurringEndingSection}
            totalTestId={HomeTestIds.RecurringEndingTotal}
          />
        </SimpleGrid>
      </Stack>
    </PullToRefresh>
  )
}
