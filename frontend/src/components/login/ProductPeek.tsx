import { useState } from 'react'
import { IconRefresh } from '@tabler/icons-react'
import { LoginTestIds } from '@/testIds'
import classes from './ProductPeek.module.css'

type Example = {
  title: string
  category: string
  amount: string
  split: number
  mateus: string
  amanda: string
}

const EXAMPLES: Example[] = [
  {
    title: 'Mercado do mês',
    category: 'Mercado',
    amount: 'R$ 218,45',
    split: 50,
    mateus: 'R$ 109,22',
    amanda: 'R$ 109,23',
  },
  {
    title: 'Aluguel de maio',
    category: 'Moradia',
    amount: 'R$ 1.850,00',
    split: 60,
    mateus: 'R$ 1.110,00',
    amanda: 'R$ 740,00',
  },
  {
    title: 'Jantar de aniversário',
    category: 'Restaurante',
    amount: 'R$ 320,00',
    split: 70,
    mateus: 'R$ 224,00',
    amanda: 'R$ 96,00',
  },
]

/**
 * A live preview of a shared expense, reinforcing the product's "a dois"
 * thesis. Tapping the card cycles through real-looking examples — the split
 * bar, the amounts and the dot indicator animate between states.
 */
export function ProductPeek() {
  const [index, setIndex] = useState(0)
  const example = EXAMPLES[index]
  const next = () => setIndex((i) => (i + 1) % EXAMPLES.length)

  return (
    <div
      className={classes.card}
      role="button"
      tabIndex={0}
      title="Toque para ver outro exemplo"
      onClick={next}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          next()
        }
      }}
      data-testid={LoginTestIds.Showcase}
    >
      <div className={classes.header}>
        <span className={classes.period}>Maio · compartilhado</span>
        <span className={classes.swap}>
          <IconRefresh size={12} stroke={2} />
          outro
        </span>
      </div>

      <div className={classes.body}>
        <div className={classes.txRow}>
          <span className={classes.avatar}>M</span>
          <div className={classes.txMeta}>
            <div className={classes.txTitle}>{example.title}</div>
            <div className={classes.txSub}>
              {example.category} · dividido {example.split}/{100 - example.split}
            </div>
          </div>
          <div className={classes.txAmount}>{example.amount}</div>
        </div>

        <div
          className={classes.splitBar}
          style={{
            gridTemplateColumns: `${example.split}fr ${100 - example.split}fr`,
          }}
        >
          <span className={classes.splitMine} />
          <span className={classes.splitPartner} />
        </div>

        <div className={classes.shares}>
          <span>
            <b>Mateus</b> {example.mateus}
          </span>
          <span>
            <b>Amanda</b> {example.amanda}
          </span>
        </div>

        <div className={classes.dots}>
          {EXAMPLES.map((_, i) => (
            <span
              key={i}
              className={i === index ? classes.dotActive : classes.dot}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
