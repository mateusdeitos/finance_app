import { motion } from 'motion/react'

const SIZE = 180
const CENTER = SIZE / 2
const RADIUS_INNER = 46
const RADIUS_OUTER = 66
const STROKE = 14

type Segment = { label: string; pct: number; color: string }

const ROOT_CATEGORIES: Segment[] = [
  { label: 'Moradia', pct: 42, color: 'var(--color-brand-600)' },
  { label: 'Alimentação', pct: 33, color: 'var(--color-positive-600)' },
  { label: 'Transporte', pct: 25, color: 'var(--color-warning-600)' },
]

const SUBCATEGORIES: Segment[] = [
  { label: 'Aluguel', pct: 22, color: 'var(--color-brand-300)' },
  { label: 'Condomínio', pct: 20, color: 'var(--color-brand-500)' },
  { label: 'Mercado', pct: 18, color: 'var(--color-positive-300)' },
  { label: 'Restaurantes', pct: 15, color: 'var(--color-positive-500)' },
  { label: 'Combustível', pct: 25, color: 'var(--color-warning-400)' },
]

function withOffsets(segments: Segment[]) {
  let cumulative = 0
  return segments.map((segment) => {
    const start = cumulative
    cumulative += segment.pct
    return { ...segment, start }
  })
}

function Ring({ radius, segments, delayOffset }: { radius: number; segments: Segment[]; delayOffset: number }) {
  const withStart = withOffsets(segments)

  return (
    <>
      {withStart.map((segment, index) => (
        <motion.circle
          key={segment.label}
          cx={CENTER}
          cy={CENTER}
          r={radius}
          fill="none"
          stroke={segment.color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
          pathOffset={segment.start / 100}
          initial={{ pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: segment.pct / 100, opacity: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.8, delay: delayOffset + index * 0.12, ease: 'easeOut' }}
        />
      ))}
    </>
  )
}

export default function DonutAnimation() {
  return (
    <div className="mx-auto flex w-full max-w-72 flex-col items-center gap-4 sm:max-w-80">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="max-w-[11rem] sm:max-w-[13rem]">
        <Ring radius={RADIUS_OUTER} segments={SUBCATEGORIES} delayOffset={0.3} />
        <Ring radius={RADIUS_INNER} segments={ROOT_CATEGORIES} delayOffset={0} />
      </svg>

      <ul className="grid w-full grid-cols-1 gap-1.5 text-sm text-neutral-700">
        {ROOT_CATEGORIES.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            <span>{segment.label}</span>
            <span className="ml-auto font-medium text-neutral-500">{segment.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
