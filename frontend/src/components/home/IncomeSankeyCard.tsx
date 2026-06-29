import type { ReactNode, ReactElement } from 'react'
import type { SVGProps } from 'react'
import { Box, Center, Group, Loader, Stack, Text } from '@mantine/core'
import { Sankey, Tooltip, ResponsiveContainer, Layer, Rectangle } from 'recharts'
import { useIncomeExpenseFlow, type FlowNode } from '@/hooks/useIncomeExpenseFlow'
import { useIsMobile } from '@/hooks/useIsMobile'
import { formatBalance } from '@/utils/formatCents'
import { DashboardCard } from './DashboardCard'
import { HomeTestIds } from '@/testIds'
import classes from './ExpenseDonutCard.module.css'

interface Props {
  month: number
  year: number
}

// recharts doesn't export its Sankey node/link prop types from the package root,
// and it injects our extra node fields (color, kind) at runtime since data.nodes
// is untyped. Type the renderer params with the shape we read; `unknown` keeps
// them assignable to recharts' expected (props) => ReactNode signature.
interface SankeyNodeRenderProps {
  x: number
  y: number
  width: number
  height: number
  index: number
  // recharts merges our FlowNode fields with its computed node; sourceLinks lets
  // us tell an expense parent (has outgoing links to subcategories) from a leaf.
  payload: FlowNode & { sourceLinks?: unknown[] }
}

interface SankeyLinkRenderProps {
  sourceX: number
  targetX: number
  sourceY: number
  targetY: number
  sourceControlX: number
  targetControlX: number
  linkWidth: number
  index: number
  payload: { color?: string }
}

function renderSankeyNode(rawProps: unknown): ReactNode {
  const { x, y, width, height, payload, index } = rawProps as SankeyNodeRenderProps
  const node = payload
  let labelX: number
  let labelY = y + height / 2
  let anchor: 'start' | 'end' | 'middle'
  const hasChildren = (node.sourceLinks?.length ?? 0) > 0
  if (node.kind === 'income') {
    labelX = x - 6
    anchor = 'end'
  } else if (node.kind === 'hub' || (node.kind === 'expense' && hasChildren)) {
    // Hub and expense parents have outgoing links to their right, so anchor the
    // label above the node (clamped under the top edge) instead of overlapping
    // those flows.
    labelX = x + width / 2
    labelY = Math.max(y - 12, 14)
    anchor = 'middle'
  } else {
    // Leaves: income/expense subcategories, childless parents and "Sobra".
    labelX = x + width + 6
    anchor = 'start'
  }
  return (
    <Layer key={`node-${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill={node.color} fillOpacity={0.9} radius={2} />
      <text
        x={labelX}
        y={labelY}
        textAnchor={anchor}
        dominantBaseline="middle"
        fontSize={11}
        fill="var(--mantine-color-text)"
      >
        {node.name}
      </text>
    </Layer>
  )
}

function renderSankeyLink(rawProps: unknown): ReactElement<SVGProps<SVGPathElement>> {
  const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload, index } =
    rawProps as SankeyLinkRenderProps
  const color = payload.color ?? '#888'
  return (
    <path
      key={`link-${index}`}
      d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      stroke={color}
      strokeWidth={Math.max(1, linkWidth)}
      strokeOpacity={0.35}
      fill="none"
    />
  )
}

function SankeyTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ payload: { value?: number; name?: string } }>
}) {
  if (!active || !payload?.length) return null
  const data = payload[0].payload
  if (data.value == null) return null
  return (
    <div className={classes.tooltip}>
      {data.name && <Text size="sm" fw={600}>{data.name}</Text>}
      <Text size="sm">{formatBalance(data.value)}</Text>
    </div>
  )
}

export function IncomeSankeyCard({ month, year }: Props) {
  const { nodes, links, totalIncome, totalExpense, leftover, hasData, isLoading } =
    useIncomeExpenseFlow(month, year)
  const isMobile = useIsMobile()

  // Grow the chart with the number of nodes so labels don't overlap.
  const height = Math.max(260, nodes.length * 28)
  // Side margins reserve room for the income/expense labels; trim them on
  // mobile so the flow isn't squeezed into a thin strip.
  const sideMargin = isMobile ? 60 : 90

  return (
    <DashboardCard title="Distribuição da receita" testId={HomeTestIds.IncomeFlowSection}>
      {isLoading ? (
        <Center h={260}><Loader size="sm" /></Center>
      ) : !hasData ? (
        <Text c="dimmed" ta="center" py="xl">Nenhuma receita no período</Text>
      ) : (
        <Stack gap="sm">
          <Box h={height} data-testid={HomeTestIds.IncomeFlowChart}>
            <ResponsiveContainer width="100%" height="100%">
              <Sankey
                data={{ nodes, links }}
                node={renderSankeyNode}
                link={renderSankeyLink}
                nodePadding={24}
                nodeWidth={10}
                margin={{ top: 30, right: sideMargin, bottom: 8, left: sideMargin }}
              >
                <Tooltip content={<SankeyTooltip />} />
              </Sankey>
            </ResponsiveContainer>
          </Box>
          <Group justify="space-between" wrap="wrap" gap="md">
            <Text size="sm" c="teal">Receitas: {formatBalance(totalIncome)}</Text>
            <Text size="sm" c="red">Despesas: {formatBalance(totalExpense)}</Text>
            <Text size="sm" c={leftover >= 0 ? 'teal' : 'red'} fw={600}>
              {leftover >= 0 ? 'Sobra' : 'Déficit'}: {formatBalance(leftover)}
            </Text>
          </Group>
        </Stack>
      )}
    </DashboardCard>
  )
}
