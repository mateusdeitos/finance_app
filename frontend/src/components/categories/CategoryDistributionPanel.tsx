import { CategorySpendingNode } from '@/hooks/useCategorySpending'
import { formatBalance } from '@/utils/formatCents'
import { CategoriesTestIds } from '@/testIds'
import classes from './CategoryDistributionPanel.module.css'

interface Props {
  nodes: CategorySpendingNode[]
  total: number
  /** e.g. "maio" — used in the panel label "Distribuição de maio". */
  monthLabel: string
}

/** Month spend distribution: total, a stacked participation bar and a legend. */
export function CategoryDistributionPanel({ nodes, total, monthLabel }: Props) {
  const spent = nodes.filter((n) => n.total > 0)

  return (
    <div className={classes.panel} data-testid={CategoriesTestIds.DistributionPanel}>
      <div className={classes.head}>
        <div>
          <div className={classes.label}>Distribuição de {monthLabel}</div>
          <div className={classes.total}>{formatBalance(total)}</div>
        </div>
        <div className={classes.count}>
          {spent.length} {spent.length === 1 ? 'categoria' : 'categorias'}
        </div>
      </div>

      {total > 0 ? (
        <>
          <div className={classes.bar}>
            {spent.map((n) => (
              <div
                key={n.category.id}
                title={n.category.name}
                className={classes.segment}
                style={{ width: `${(n.total / total) * 100}%`, background: n.color }}
              />
            ))}
          </div>

          <div className={classes.legend}>
            {spent.map((n) => (
              <div key={n.category.id} className={classes.legendItem}>
                <span className={classes.swatch} style={{ background: n.color }} />
                <span className={classes.legendName}>{n.category.name}</span>
                <span className={classes.legendPct} style={{ color: n.color }}>
                  {Math.round((n.total / total) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className={classes.empty}>Sem gastos neste período.</div>
      )}
    </div>
  )
}
