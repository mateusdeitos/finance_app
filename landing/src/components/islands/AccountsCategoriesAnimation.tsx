import { motion, type Variants } from 'motion/react'

type Account = { name: string; balance: string; color: string; shared?: boolean }

const ACCOUNTS: Account[] = [
  { name: 'Sua conta', balance: 'R$ 3.240,00', color: 'var(--color-brand-600)' },
  { name: 'Conta do par', balance: 'R$ 1.860,00', color: 'var(--color-positive-600)' },
  { name: 'Conta conjunta', balance: 'R$ 540,00', color: 'var(--color-warning-600)', shared: true },
]

type Category = { emoji: string; label: string; children?: Category[] }

const CATEGORIES: Category[] = [
  {
    emoji: '🏠',
    label: 'Moradia',
    children: [
      { emoji: '🔑', label: 'Aluguel' },
      { emoji: '💡', label: 'Luz' },
    ],
  },
  { emoji: '🍔', label: 'Alimentação' },
  { emoji: '🚗', label: 'Transporte' },
  { emoji: '🎯', label: 'Metas' },
]

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
}

export default function AccountsCategoriesAnimation() {
  return (
    <div className="mx-auto flex w-full max-w-80 flex-col gap-6">
      <motion.ul
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
        variants={listVariants}
        className="flex flex-col gap-2"
      >
        {ACCOUNTS.map((account) => (
          <motion.li
            key={account.name}
            variants={itemVariants}
            className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-2.5"
          >
            <span
              aria-hidden="true"
              className="h-8 w-8 shrink-0 rounded-full"
              style={{ backgroundColor: account.color }}
            />
            <span className="flex-1">
              <span className="block text-sm font-medium text-neutral-900">{account.name}</span>
              {account.shared && <span className="block text-xs text-neutral-500">Conta conjunta</span>}
            </span>
            <span className="text-sm font-semibold text-neutral-700">{account.balance}</span>
          </motion.li>
        ))}
      </motion.ul>

      <motion.ul
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
        variants={listVariants}
        className="flex flex-col gap-2"
      >
        {CATEGORIES.map((category) => (
          <motion.li key={category.label} variants={itemVariants}>
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-800">
              <span aria-hidden="true">{category.emoji}</span>
              {category.label}
            </span>
            {category.children && (
              <div className="ml-4 mt-1.5 flex flex-col gap-1.5 border-l-2 border-neutral-200 pl-3">
                {category.children.map((child) => (
                  <span
                    key={child.label}
                    className="inline-flex w-fit min-h-8 items-center gap-1.5 rounded-full bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600"
                  >
                    <span aria-hidden="true">{child.emoji}</span>
                    {child.label}
                  </span>
                ))}
              </div>
            )}
          </motion.li>
        ))}
      </motion.ul>
    </div>
  )
}
