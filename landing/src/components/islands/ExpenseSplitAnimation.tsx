import { AnimatePresence, motion } from 'motion/react'
import { useLoopStep } from './useLoopStep'

const STEP_COUNT = 5 // 0 reset · 1 expense · 2 split · 3 cobrança pendente · 4 cobrança paga

export default function ExpenseSplitAnimation() {
  const step = useLoopStep(STEP_COUNT, 1700)

  return (
    <div className="mx-auto flex w-full max-w-72 flex-col items-center gap-3 sm:max-w-80">
      <AnimatePresence>
        {step >= 1 && (
          <motion.div
            key="expense"
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm"
          >
            <p className="text-xs text-neutral-500">Despesa compartilhada</p>
            <p className="font-semibold text-neutral-900">🏠 Aluguel · R$ 2.000,00</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {step >= 2 && (
          <motion.div
            key="split"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
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
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {step >= 3 && (
          <motion.div
            key={step >= 4 ? 'paid' : 'pending'}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={
              'flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium ' +
              (step >= 4 ? 'bg-positive-100 text-positive-900' : 'bg-warning-100 text-warning-900')
            }
          >
            <span>Cobrança</span>
            <span aria-hidden="true">·</span>
            <span>{step >= 4 ? 'Paga ✓' : 'Pendente'}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
