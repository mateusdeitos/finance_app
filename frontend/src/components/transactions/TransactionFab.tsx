import { IconPlus } from '@tabler/icons-react'
import { Fab } from '@/components/Fab'
import { renderDrawer } from '@/utils/renderDrawer'
import { CreateTransactionDrawer } from '@/components/transactions/CreateTransactionDrawer'
import { TransactionsTestIds } from '@/testIds'

export function TransactionFab() {
  return (
    <Fab
      onClick={() => void renderDrawer(() => <CreateTransactionDrawer />)}
      ariaLabel="Nova Transação"
      testId={TransactionsTestIds.BtnNew}
    >
      <IconPlus size={24} stroke={2.2} />
    </Fab>
  )
}
