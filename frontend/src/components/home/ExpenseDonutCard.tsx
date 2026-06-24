import { useMemo } from 'react'
import { Box, Center, Group, Loader, Stack, Switch, Text } from '@mantine/core'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useCategorySpending } from '@/hooks/useCategorySpending'
import { formatBalance } from '@/utils/formatCents'
import { DashboardCard } from './DashboardCard'
import { HomeTestIds } from '@/testIds'
import classes from './ExpenseDonutCard.module.css'

interface Props {
  month: number
  year: number
  /** When true, settlements are ignored in the aggregation. */
  hideSettlements: boolean
  onHideSettlementsChange: (value: boolean) => void
}

interface Slice {
  name: string
  value: number
  color: string
}

function DonutTooltip({ active, payload, total }: {
  active?: boolean
  payload?: Array<{ payload: Slice }>
  total: number
}) {
  if (!active || !payload?.length) return null
  const slice = payload[0].payload
  const pct = total > 0 ? Math.round((slice.value / total) * 100) : 0
  return (
    <div className={classes.tooltip}>
      <Text size="sm" fw={600}>{slice.name}</Text>
      <Text size="sm">{formatBalance(slice.value)} · {pct}%</Text>
    </div>
  )
}

export function ExpenseDonutCard({ month, year, hideSettlements, onHideSettlementsChange }: Props) {
  const { nodes, categoriesLoading, spendLoading } = useCategorySpending(month, year, { hideSettlements })
  const isLoading = categoriesLoading || spendLoading

  const { slices, total } = useMemo(() => {
    const slices: Slice[] = nodes
      .filter((n) => n.total < 0)
      .map((n) => ({ name: n.category.name, value: -n.total, color: n.color }))
      .sort((a, b) => b.value - a.value)
    const total = slices.reduce((s, x) => s + x.value, 0)
    return { slices, total }
  }, [nodes])

  return (
    <DashboardCard
      title="Despesas por categoria"
      testId={HomeTestIds.ExpenseChartSection}
      action={
        <Group gap={8} wrap="nowrap" align="center">
          <Text size="sm" ta="right">Considerar acertos</Text>
          <Switch
            size="sm"
            checked={!hideSettlements}
            onChange={(e) => onHideSettlementsChange(!e.currentTarget.checked)}
            aria-label="Considerar acertos"
            data-testid={HomeTestIds.SettlementsToggle}
          />
        </Group>
      }
    >
      {isLoading ? (
        <Center h={260}><Loader size="sm" /></Center>
      ) : slices.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">Nenhuma despesa no período</Text>
      ) : (
        <Stack gap="sm">
          <Box h={240} data-testid={HomeTestIds.ExpenseChart}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={1}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip total={total} />} />
              </PieChart>
            </ResponsiveContainer>
          </Box>
          <Stack gap={4}>
            {slices.map((s) => {
              const pct = total > 0 ? Math.round((s.value / total) * 100) : 0
              return (
                <Group key={s.name} justify="space-between" wrap="nowrap" gap="xs">
                  <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                    <span className={classes.swatch} style={{ backgroundColor: s.color }} />
                    <Text size="sm" truncate>{s.name}</Text>
                  </Group>
                  <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                    {formatBalance(s.value)} · {pct}%
                  </Text>
                </Group>
              )
            })}
          </Stack>
        </Stack>
      )}
    </DashboardCard>
  )
}
