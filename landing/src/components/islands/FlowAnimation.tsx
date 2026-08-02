import { motion } from 'motion/react'

const WIDTH = 280
const HEIGHT = 210
const SOURCE = { x: WIDTH / 2, y: 26 }

type Node = { label: string; value: string; x: number; color: string }

const DESTINATIONS: Node[] = [
  { label: 'Moradia', value: 'R$ 1.260', x: 30, color: 'var(--color-brand-600)' },
  { label: 'Alimentação', value: 'R$ 990', x: 100, color: 'var(--color-positive-600)' },
  { label: 'Transporte', value: 'R$ 750', x: 180, color: 'var(--color-warning-600)' },
  { label: 'Sobra', value: 'R$ 400', x: 250, color: 'var(--color-positive-800)' },
]

const NODE_Y = 168

function flowPath(target: Node) {
  const midY = (SOURCE.y + NODE_Y) / 2
  return `M ${SOURCE.x} ${SOURCE.y} C ${SOURCE.x} ${midY}, ${target.x} ${midY}, ${target.x} ${NODE_Y}`
}

export default function FlowAnimation() {
  return (
    <div className="mx-auto flex w-full max-w-72 flex-col items-center gap-2 sm:max-w-80">
      <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full">
        {DESTINATIONS.map((node, index) => (
          <motion.path
            key={node.label}
            d={flowPath(node)}
            fill="none"
            stroke={node.color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray="2 8"
            initial={{ opacity: 0, strokeDashoffset: 0 }}
            animate={{ opacity: 0.85, strokeDashoffset: [-40, 0] }}
            transition={{
              opacity: { duration: 0.5, delay: index * 0.1 },
              strokeDashoffset: { duration: 2.4, repeat: Infinity, ease: 'linear', delay: index * 0.1 },
            }}
          />
        ))}

        <g>
          <rect x={SOURCE.x - 44} y={SOURCE.y - 16} width={88} height={30} rx={15} fill="var(--color-brand-600)" />
          <text
            x={SOURCE.x}
            y={SOURCE.y + 4}
            textAnchor="middle"
            className="fill-white text-[11px] font-semibold"
          >
            Receita
          </text>
        </g>

        {DESTINATIONS.map((node) => (
          <g key={node.label}>
            <circle cx={node.x} cy={NODE_Y} r={5} fill={node.color} />
            <text
              x={node.x}
              y={NODE_Y + 20}
              textAnchor="middle"
              className="fill-neutral-700 text-[9px] font-medium"
            >
              {node.label}
            </text>
            <text
              x={node.x}
              y={NODE_Y + 32}
              textAnchor="middle"
              className="fill-neutral-500 text-[9px]"
            >
              {node.value}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
