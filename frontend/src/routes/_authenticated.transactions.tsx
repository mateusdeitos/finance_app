import { ActionIcon, Box, Button, Drawer, Group, Stack } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconFilter, IconPlus } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { useCallback, useState } from 'react'
import { z } from 'zod'
import { useMe } from '@/hooks/useMe'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useActiveFilters } from '@/hooks/useActiveFilters'
import { useTransactions } from '@/hooks/useTransactions'
import { renderDrawer } from '@/utils/renderDrawer'
import { ClearFiltersButton } from '@/components/transactions/ClearFiltersButton'
import { CreateTransactionDrawer } from '@/components/transactions/CreateTransactionDrawer'
import { MobileBottomBar } from '@/components/transactions/MobileBottomBar'
import { PeriodNavigator } from '@/components/transactions/PeriodNavigator'
import { TransactionFilters } from '@/components/transactions/TransactionFilters'
import { TransactionList } from '@/components/transactions/TransactionList'
import { SelectionActionBar } from '@/components/transactions/SelectionActionBar'
import { PropagationSettingsDrawer, PropagationSetting } from '@/components/transactions/PropagationSettingsDrawer'
import { BulkDeleteProgressDrawer } from '@/components/transactions/BulkDeleteProgressDrawer'
import { TextSearch } from '@/components/transactions/filters/TextSearch'

const now = new Date()

const transactionSearchSchema = z.object({
  month: z.coerce.number().int().min(1).max(12).default(now.getMonth() + 1),
  year: z.coerce.number().int().default(now.getFullYear()),
  query: z.string().default(''),
  tagIds: z.array(z.number()).default([]),
  categoryIds: z.array(z.number()).default([]),
  accountIds: z.array(z.number()).default([]),
  types: z.array(z.enum(['expense', 'income', 'transfer'])).default([]),
  groupBy: z.enum(['date', 'category', 'account']).default('date'),
  accumulated: z.coerce.boolean().default(false),
  hideSettlements: z.coerce.boolean().default(false),
})

export const Route = createFileRoute('/_authenticated/transactions')({
  validateSearch: zodValidator(transactionSearchSchema),
  component: TransactionsPage,
})

function TransactionsPage() {
  const search = Route.useSearch()
  const isMobile = useIsMobile()
  const [filtersOpened, { open: openFilters, close: closeFilters }] = useDisclosure(false)

  const { query: meQuery } = useMe((me) => me.id)
  const currentUserId = meQuery.data ?? 0

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const toggleSelection = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  // Transactions data (needed to find full transaction objects for selected IDs)
  // Uses same params as TransactionList so they share the same query cache entry
  const filters = useActiveFilters()
  const { query: txQuery, invalidate: invalidateTransactions } = useTransactions({
    month: search.month,
    year: search.year,
    ...filters,
  })
  const allTransactions = txQuery.data ?? []

  const hasRecurring = [...selectedIds].some((id) => {
    const tx = allTransactions.find((t) => t.id === id)
    return tx?.transaction_recurrence_id != null
  })

  async function handleDeleteClick() {
    try {
      let propagation: PropagationSetting | undefined
      if (hasRecurring) {
        propagation = await renderDrawer<PropagationSetting>(() => <PropagationSettingsDrawer />)
      }

      const txsToDelete = [...selectedIds].map((id) => {
        const tx = allTransactions.find((t) => t.id === id)
        return {
          id,
          description: tx?.description ?? String(id),
          propagationSettings: tx?.transaction_recurrence_id != null ? propagation : undefined,
        }
      })

      void renderDrawer(() => (
        <BulkDeleteProgressDrawer
          transactions={txsToDelete}
          onInvalidate={invalidateTransactions}
          onSuccess={clearSelection}
        />
      ))
    } catch {
      // User dismissed the propagation drawer without confirming
    }
  }

  const isSelecting = selectedIds.size > 0

  if (isMobile) {
    return (
      <Stack gap="sm" pb="5rem">
        <Box
          style={{
            position: 'sticky',
            top: 'calc(-1 * var(--mantine-spacing-md))',
            zIndex: 10,
            background: 'var(--mantine-color-body)',
            marginTop: 'calc(-1 * var(--mantine-spacing-md))',
            paddingTop: 'var(--mantine-spacing-md)',
            paddingBottom: 'var(--mantine-spacing-xs)',
          }}
        >
          <Stack gap="xs" style={{ visibility: isSelecting ? 'hidden' : undefined }}>
            <Group justify="space-between" align="center">
              <PeriodNavigator month={search.month} year={search.year} />
              <Button
                size="xs"
                leftSection={<IconPlus size={14} />}
                onClick={() => void renderDrawer(() => <CreateTransactionDrawer />)}
                data-testid="btn_new_transaction"
              >
                Nova Transação
              </Button>
            </Group>
            <TextSearch />
          </Stack>
        </Box>

        <TransactionList
          currentUserId={currentUserId}
          selectedIds={selectedIds}
          onSelectTransaction={toggleSelection}
        />

        {isSelecting ? (
          <SelectionActionBar
            count={selectedIds.size}
            onClearSelection={clearSelection}
            onDelete={handleDeleteClick}
          />
        ) : (
          <MobileBottomBar>
            <ClearFiltersButton variant="icon" />
            <ActionIcon
              size="xl"
              radius="xl"
              variant="filled"
              onClick={openFilters}
              aria-label="Abrir filtros"
            >
              <IconFilter size={20} />
            </ActionIcon>
          </MobileBottomBar>
        )}

        <Drawer
          opened={filtersOpened}
          onClose={closeFilters}
          position="bottom"
          title="Filtros"
          size="auto"
          styles={{
            content: { borderRadius: 'var(--mantine-radius-lg) var(--mantine-radius-lg) 0 0', maxHeight: '75dvh', overflowY: 'auto' },
          }}
        >
          <TransactionFilters orientation="column" hideTextSearch />
        </Drawer>

      </Stack>
    )
  }

  return (
    <Stack gap="md">
      <Box
        style={{
          position: 'sticky',
          top: 'calc(-1 * var(--mantine-spacing-md))',
          zIndex: 10,
          background: 'var(--mantine-color-body)',
          marginTop: 'calc(-1 * var(--mantine-spacing-md))',
          paddingTop: 'var(--mantine-spacing-md)',
          paddingBottom: 'var(--mantine-spacing-xs)',
        }}
      >
        <Stack gap="sm" style={{ visibility: isSelecting ? 'hidden' : undefined }}>
          <Group justify="space-between" align="center">
            <PeriodNavigator month={search.month} year={search.year} />
            <Button leftSection={<IconPlus size={16} />} onClick={() => void renderDrawer(() => <CreateTransactionDrawer />)} data-testid="btn_new_transaction">
              Nova Transação
            </Button>
          </Group>
          <TransactionFilters orientation="row" />
        </Stack>
      </Box>

      <TransactionList
        currentUserId={currentUserId}
        selectedIds={selectedIds}
        onSelectTransaction={toggleSelection}
      />

      {isSelecting && (
        <SelectionActionBar
          count={selectedIds.size}
          onClearSelection={clearSelection}
          onDelete={handleDeleteClick}
        />
      )}

    </Stack>
  )
}
