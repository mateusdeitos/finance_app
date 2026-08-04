import { motion } from 'motion/react'
import { useLoopStep } from './useLoopStep'

const STEP_COUNT = 5 // 0 reset · 1 expense · 2 split · 3 cobrança pendente · 4 cobrança paga

// Blocks stay mounted the whole time and only animate opacity/position — this
// keeps the section's height constant across the loop instead of growing and
// shrinking as blocks mount/unmount.
export default function ExpenseSplitAnimation() {
  const step = useLoopStep(STEP_COUNT, 1700)

  return (
    <div className="mx-auto flex w-full max-w-72 flex-col items-center gap-3 sm:max-w-80">
      <motion.div
        animate={step >= 1 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -8, scale: 0.95 }}
        transition={{ duration: 0.35 }}
        className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm"
      >
        <p className="text-xs text-neutral-500">Despesa compartilhada</p>
        <p className="font-semibold text-neutral-900">🏠 Aluguel · R$ 2.000,00</p>
      </motion.div>

      <motion.div
        animate={step >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: -6 }}
        transition={{ duration: 0.35 }}
        className="grid w-full grid-cols-2 gap-3"
      >
        <div className="rounded-xl bg-brand-50 px-3 py-2 text-center">
          <p className="text-xs text-brand-700">Sua conta</p>
          <p className="font-semibold text-brand-900">R$ 1.000,00</p>
        </div>
        <div className="rounded-xl bg-positive-50 px-3 py-2 text-center">
          <p className="text-xs text-positive-800">Conta do par</p>
          <p className="font-semibold text-positive-900">R$ 1.000,00</p>
        </div>
      </motion.div>

      <motion.div
        animate={step >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.35 }}
        className={
          'flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium ' +
          (step >= 4 ? 'bg-positive-100 text-positive-900' : 'bg-warning-100 text-warning-900')
        }
      >
        <span>Cobrança</span>
        <span aria-hidden="true">·</span>
        <span>{step >= 4 ? 'Paga ✓' : 'Pendente'}</span>
      </motion.div>
    </div>
  )
}
