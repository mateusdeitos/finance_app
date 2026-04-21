import { Drawer } from '@mantine/core'
import { useDrawerContext } from '@/utils/renderDrawer'
import { TransactionFilters } from '@/components/transactions/TransactionFilters'

export function FiltersDrawer() {
  const { opened, reject } = useDrawerContext<void>()

  return (
    <Drawer
      opened={opened}
      onClose={reject}
      position="bottom"
      title="Filtros"
      size="auto"
      data-testid="drawer_transaction_filters"
      styles={{
        content: {
          borderRadius: 'var(--mantine-radius-lg) var(--mantine-radius-lg) 0 0',
          maxHeight: '75dvh',
          overflowY: 'auto',
        },
      }}
    >
      <TransactionFilters orientation="column" hideTextSearch />
    </Drawer>
  )
}
