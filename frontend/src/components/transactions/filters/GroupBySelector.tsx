import { SegmentedControl, Stack, Text } from '@mantine/core'
import { useTransactionsSearch } from '@/hooks/useTransactionsSearch'
import { Transactions } from '@/types/transactions'
import { TransactionsTestIds } from '@/testIds'

const OPTIONS = [
  {
    value: 'date',
    label: <span data-testid={TransactionsTestIds.SegmentGroupBy('date')}>Data</span>,
  },
  {
    value: 'category',
    label: <span data-testid={TransactionsTestIds.SegmentGroupBy('category')}>Categoria</span>,
  },
  {
    value: 'account',
    label: <span data-testid={TransactionsTestIds.SegmentGroupBy('account')}>Conta</span>,
  },
]

export function GroupBySelector() {
  const { search, update } = useTransactionsSearch()
  const groupBy = search.groupBy ?? 'date'

  function onChange(value: string) {
    update((prev) => ({ ...prev, groupBy: value as Transactions.GroupBy }))
  }

  return (
    <Stack gap={4}>
      <Text size="sm" c="dimmed">Agrupar por</Text>
      <SegmentedControl value={groupBy} onChange={onChange} data={OPTIONS} size="sm" data-testid={TransactionsTestIds.SegmentedGroupBy} />
    </Stack>
  )
}
