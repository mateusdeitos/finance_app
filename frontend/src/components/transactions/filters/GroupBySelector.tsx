import { SegmentedControl, Stack, Text } from '@mantine/core'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Transactions } from '@/types/transactions'

const OPTIONS = [
  { value: 'date', label: 'Data' },
  { value: 'category', label: 'Categoria' },
  { value: 'account', label: 'Conta' },
]

export function GroupBySelector() {
  const navigate = useNavigate({ from: '/transactions' })
  const search = useSearch({ from: '/_authenticated/transactions' })
  const groupBy = search.groupBy ?? 'date'

  function onChange(value: string) {
    navigate({
      search: (prev) => ({ ...prev, groupBy: value as Transactions.GroupBy }),
    })
  }

  return (
    <Stack gap={4}>
      <Text size="sm" c="dimmed">Agrupar por</Text>
      <SegmentedControl value={groupBy} onChange={onChange} data={OPTIONS} size="sm" />
    </Stack>
  )
}
