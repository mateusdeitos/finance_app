import { IconPlus } from '@tabler/icons-react'
import { Fab } from '@/components/Fab'
import { renderDrawer } from '@/utils/renderDrawer'
import { CreateTransactionDrawer } from '@/components/transactions/CreateTransactionDrawer'
import { useActiveFilters } from '@/hooks/useActiveFilters'
import { TransactionsTestIds } from '@/testIds'

export function TransactionFab() {
  const filters = useActiveFilters()
  // When the list is filtered to a single account, default the new transaction
  // to that account (overrides the localStorage prefill).
  const initialAccountId = filters.accountIds.length === 1 ? filters.accountIds[0] : undefined

  return (
    <Fab
      onClick={() => void renderDrawer(() => <CreateTransactionDrawer initialAccountId={initialAccountId} />)}
      ariaLabel="Nova Transação"
      testId={TransactionsTestIds.BtnNew}
    >
      <IconPlus size={24} stroke={2.2} />
    </Fab>
  )
}
