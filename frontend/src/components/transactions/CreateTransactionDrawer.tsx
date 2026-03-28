import { useState, useRef } from 'react'
import { Drawer } from '@mantine/core'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { useMe } from '@/hooks/useMe'
import { useTransactionPrefill } from '@/hooks/useTransactionPrefill'
import { Transactions } from '@/types/transactions'
import { useDrawerContext } from '@/utils/renderDrawer'
import { TransactionForm, TransactionFormHandle } from './form/TransactionForm'

const TYPE_LABELS: Record<Transactions.TransactionType, string> = {
  expense: 'Nova Despesa',
  income: 'Nova Receita',
  transfer: 'Nova Transferência',
}

export function CreateTransactionDrawer() {
  const { opened, close } = useDrawerContext<void>()
  const [transactionType, setTransactionType] = useState<Transactions.TransactionType>('expense')
  const formRef = useRef<TransactionFormHandle>(null)
  const hasFocused = useRef(false)

  const { query: meQuery } = useMe((me) => me.id)
  const currentUserId = meQuery.data ?? 0

  const { query: accountsQuery } = useAccounts()
  const { query: categoriesQuery } = useCategories()

  const accounts = accountsQuery.data ?? []
  const categories = categoriesQuery.data ?? []

  const { prefill, savePrefill } = useTransactionPrefill({
    userId: currentUserId,
    accounts,
    categories,
  })

  const initialValues: Record<string, unknown> = {}
  if (prefill.date) initialValues.date = prefill.date
  if (prefill.accountId) initialValues.account_id = prefill.accountId
  if (prefill.categoryId) initialValues.category_id = prefill.categoryId

  return (
    <Drawer
      opened={opened}
      onClose={close}
      title={TYPE_LABELS[transactionType]}
      position="right"
      size="md"
      onTransitionEnd={() => {
        if (opened && !hasFocused.current) {
          hasFocused.current = true
          formRef.current?.focusAmount()
        }
      }}
    >
      <TransactionForm
        ref={formRef}
        currentUserId={currentUserId}
        initialValues={initialValues}
        onSuccess={close}
        onSavePrefill={savePrefill}
        onTypeChange={setTransactionType}
      />
    </Drawer>
  )
}
