import { useMemo } from 'react'
import { Box, Center, Group, Loader, Stack, Switch, Text } from '@mantine/core'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useCategorySpending } from '@/hooks/useCategorySpending'
import { formatBalance } from '@/utils/formatCents'
import { lightenColor } from '@/utils/categoryColors'
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

  // Two concentric rings: the inner ring is the root categories, the outer ring
  // their subcategories (plus a "(direto)" slice for the parent's own spending).
  // Both rings are built in the same root order and each parent's outer slices
  // sum to its inner slice, so the outer arcs sit exactly under their parent.
  const { inner, outer, total } = useMemo(() => {
    const roots = nodes
      .filter((n) => n.total < 0)
      .map((n) => ({ node: n, value: -n.total }))
      .sort((a, b) => b.value - a.value)

    const inner: Slice[] = []
    const outer: Slice[] = []
    for (const { node, value } of roots) {
      inner.push({ name: node.category.name, value, color: node.color })

      const children = node.children
        .filter((c) => c.total < 0)
        .map((c) => ({ node: c, value: -c.total }))
        .sort((a, b) => b.value - a.value)

      if (children.length === 0) {
        outer.push({ name: node.category.name, value, color: node.color })
        continue
      }

      let childSum = 0
      children.forEach((c, i) => {
        outer.push({
          name: c.node.category.name,
          value: c.value,
          color: lightenColor(node.color, Math.min(0.55, 0.12 * (i + 1))),
        })
        childSum += c.value
      })
      const direct = value - childSum
      if (direct > 0) {
        outer.push({ name: `${node.category.name} (direto)`, value: direct, color: node.color })
      }
    }

    const total = inner.reduce((s, x) => s + x.value, 0)
    return { inner, outer, total }
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
      ) : inner.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">Nenhuma despesa no período</Text>
      ) : (
        <Stack gap="sm">
          <Box h={240} data-testid={HomeTestIds.ExpenseChart}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                {/* Inner ring: root categories. */}
                <Pie
                  data={inner}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="40%"
                  outerRadius="60%"
                  paddingAngle={0}
                  stroke="var(--mantine-color-body)"
                  strokeWidth={1}
                  isAnimationActive={false}
                >
                  {inner.map((s, i) => (
                    <Cell key={`inner-${i}`} fill={s.color} />
                  ))}
                </Pie>
                {/* Outer ring: subcategories, aligned under their parent. */}
                <Pie
                  data={outer}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="62%"
                  outerRadius="84%"
                  paddingAngle={0}
                  stroke="var(--mantine-color-body)"
                  strokeWidth={1}
                  isAnimationActive={false}
                >
                  {outer.map((s, i) => (
                    <Cell key={`outer-${i}`} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip total={total} />} />
              </PieChart>
            </ResponsiveContainer>
          </Box>
          <Stack gap={4}>
            {inner.map((s) => {
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
