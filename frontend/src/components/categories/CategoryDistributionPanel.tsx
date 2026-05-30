import { CSSProperties } from 'react'
import { Skeleton } from '@mantine/core'
import { CategorySpendingNode } from '@/hooks/useCategorySpending'
import { formatSignedCents } from '@/utils/formatCents'
import { CategoriesTestIds } from '@/testIds'
import classes from './CategoryDistributionPanel.module.css'

interface Props {
  nodes: CategorySpendingNode[]
  /** Signed period balance (receitas − despesas). */
  net: number
  /** Σ |net| — denominator for the participation bar and legend percentages. */
  gross: number
  /** e.g. "julho" — used in the panel label "Distribuição de julho". */
  monthLabel: string
  /** Amounts still loading: show skeletons in place of the figures. */
  loading?: boolean
}

function signColor(value: number): string | undefined {
  if (value > 0) return 'var(--mantine-color-teal-6)'
  if (value < 0) return 'var(--mantine-color-red-6)'
  return undefined
}

/** Month net distribution: signed balance, a magnitude-weighted bar and a legend. */
export function CategoryDistributionPanel({ nodes, net, gross, monthLabel, loading }: Props) {
  const active = nodes.filter((n) => n.total !== 0)

  return (
    <div className={classes.panel} data-testid={CategoriesTestIds.DistributionPanel}>
      <div className={classes.head}>
        <div>
          <div className={classes.label}>Distribuição de {monthLabel}</div>
          {loading ? (
            <Skeleton height={30} width={180} mt={4} />
          ) : (
            <div
              className={classes.total}
              style={{ color: signColor(net) }}
              data-testid={CategoriesTestIds.DistributionTotal}
            >
              {formatSignedCents(net)}
            </div>
          )}
        </div>
        <div className={classes.count}>
          {active.length} {active.length === 1 ? 'categoria' : 'categorias'}
        </div>
      </div>

      {loading ? (
        <>
          <Skeleton height={14} mt={16} radius={8} />
          <div className={classes.legend}>
            {Array.from({ length: Math.max(3, nodes.length) }).map((_, i) => (
              <Skeleton key={i} height={14} width={110} />
            ))}
          </div>
        </>
      ) : gross > 0 ? (
        <>
          <div className={classes.bar}>
            {active.map((n) => (
              <div
                key={n.category.id}
                title={n.category.name}
                className={classes.segment}
                style={{ width: `${(Math.abs(n.total) / gross) * 100}%`, background: n.color }}
              />
            ))}
          </div>

          <div className={classes.legend}>
            {active.map((n) => (
              <div key={n.category.id} className={classes.legendItem}>
                <span className={classes.swatch} style={{ background: n.color }} />
                <span className={classes.legendName}>{n.category.name}</span>
                <span className={classes.legendPct} style={{ color: n.color } as CSSProperties}>
                  {Math.round((Math.abs(n.total) / gross) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className={classes.empty}>Sem movimentações neste período.</div>
      )}
    </div>
  )
}
