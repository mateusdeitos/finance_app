import { ActionIcon } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { renderDrawer } from '@/utils/renderDrawer'
import { CreateTransactionDrawer } from '@/components/transactions/CreateTransactionDrawer'
import { tapHaptic } from '@/utils/haptics'
import { TransactionsTestIds } from '@/testIds'
import classes from './TransactionFab.module.css'

export function TransactionFab() {
  return (
    <ActionIcon
      size={56}
      radius="xl"
      variant="filled"
      color="blue"
      className={classes.fab}
      onClick={() => {
        tapHaptic()
        void renderDrawer(() => <CreateTransactionDrawer />)
      }}
      aria-label="Nova Transação"
      data-testid={TransactionsTestIds.BtnNew}
    >
      <IconPlus size={24} stroke={2.2} />
    </ActionIcon>
  )
}
