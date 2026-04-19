import { ActionIcon, Box, Button, Drawer, Group, Menu, Stack } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconDots, IconFilter, IconPlus, IconTableImport } from '@tabler/icons-react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { useCallback, useState } from 'react'
import { z } from 'zod'
import { useMe } from '@/hooks/useMe'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useActiveFilters } from '@/hooks/useActiveFilters'
import { useTransactions } from '@/hooks/useTransactions'
import { useAccounts } from '@/hooks/useAccounts'
import { useTags } from '@/hooks/useTags'
import { deleteTransaction, updateTransaction } from '@/api/transactions'
import { renderDrawer } from '@/utils/renderDrawer'
import { ClearFiltersButton } from '@/components/transactions/ClearFiltersButton'
import { CreateTransactionDrawer } from '@/components/transactions/CreateTransactionDrawer'
import { MobileBottomBar } from '@/components/transactions/MobileBottomBar'
import { PeriodNavigator } from '@/components/transactions/PeriodNavigator'
import { TransactionFilters } from '@/components/transactions/TransactionFilters'
import { TransactionList } from '@/components/transactions/TransactionList'
import { SelectionActionBar } from '@/components/transactions/SelectionActionBar'
import { PropagationSettingsDrawer, PropagationSetting } from '@/components/transactions/PropagationSettingsDrawer'
import { BulkProgressDrawer, BulkProgressItem } from '@/components/transactions/BulkProgressDrawer'
import { SelectCategoryDrawer } from '@/components/transactions/SelectCategoryDrawer'
import { SelectDateDrawer } from '@/components/transactions/SelectDateDrawer'
import { TextSearch } from '@/components/transactions/filters/TextSearch'
import { Transactions } from '@/types/transactions'

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
  const routeNavigate = Route.useNavigate()
  const navigate = useNavigate()
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

  const { query: accountsQuery } = useAccounts()
  const accounts = accountsQuery.data ?? []
  const { query: tagsQuery } = useTags()
  const existingTags = tagsQuery.data ?? []

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

  // Filter out linked transactions where user is not the original creator (SEL-02 silent skip)
  function getEligibleIds(): number[] {
    return [...selectedIds].filter((id) => {
      const tx = allTransactions.find((t) => t.id === id)
      return tx?.original_user_id == null || tx?.original_user_id === currentUserId
    })
  }

  function buildFullPayload(
    tx: Transactions.Transaction,
    overrides: Partial<Transactions.UpdateTransactionPayload>,
  ): Transactions.UpdateTransactionPayload {
    const isTransfer = tx.type === 'transfer'
    const destinationAccountId = isTransfer ? tx.linked_transactions?.[0]?.account_id : undefined

    const splitSettings = isTransfer
      ? undefined
      : (tx.linked_transactions ?? [])
          .filter((lt) => lt.user_id !== tx.user_id)
          .flatMap((lt) => {
            const acc = accounts.find(
              (a) =>
                a.user_connection?.from_account_id === lt.account_id ||
                a.user_connection?.to_account_id === lt.account_id,
            )
            if (!acc?.user_connection) return []
            return [{ connection_id: acc.user_connection.id, amount: lt.amount }]
          })

    const resolvedTags = (tx.tags ?? []).map((t) => {
      const existing = existingTags.find((et) => et.name === t.name)
      return existing ? { id: existing.id, name: t.name } : { name: t.name }
    })

    return {
      transaction_type: tx.type,
      account_id: tx.account_id,
      category_id: isTransfer ? undefined : (tx.category_id ?? undefined),
      amount: tx.amount,
      date: tx.date,
      description: tx.description,
      destination_account_id: destinationAccountId,
      tags: resolvedTags.length > 0 ? resolvedTags : undefined,
      split_settings: splitSettings && splitSettings.length > 0 ? splitSettings : undefined,
      recurrence_settings: tx.transaction_recurrence
        ? {
            type: tx.transaction_recurrence.type,
            current_installment: tx.installment_number ?? 1,
            total_installments: tx.transaction_recurrence.installments,
          }
        : undefined,
      ...overrides,
    }
  }

  async function handleDeleteClick() {
    try {
      let propagation: PropagationSetting | undefined
      if (hasRecurring) {
        propagation = await renderDrawer<PropagationSetting>(() => <PropagationSettingsDrawer />)
      }

      const eligibleIds = getEligibleIds()
      const items: BulkProgressItem[] = eligibleIds.map((id) => {
        const tx = allTransactions.find((t) => t.id === id)
        return { id, label: tx?.description ?? String(id) }
      })
      if (items.length === 0) return

      void renderDrawer(() => (
        <BulkProgressDrawer
          items={items}
          action={async (item) => {
            const tx = allTransactions.find((t) => t.id === item.id)
            const prop = tx?.transaction_recurrence_id != null && propagation ? propagation : undefined
            await deleteTransaction(item.id, prop)
          }}
          titles={{
            processing: 'Excluindo transações...',
            success: 'Transações excluídas',
            error: 'Erro ao excluir',
          }}
          successMessage={(n) => n === 1 ? '1 transação excluída com sucesso' : `${n} transações excluídas com sucesso`}
          onInvalidate={invalidateTransactions}
          onSuccess={clearSelection}
          testIdPrefix="bulk_delete"
        />
      ))
    } catch {
      // User dismissed the propagation drawer without confirming
    }
  }

  async function handleCategoryChange() {
    try {
      // Step 1: User picks a category
      const category = await renderDrawer<Transactions.Category>(() => <SelectCategoryDrawer />)

      // Step 2: Check if any selected tx has recurrence -> show propagation drawer
      let propagation: PropagationSetting | undefined
      if (hasRecurring) {
        propagation = await renderDrawer<PropagationSetting>(() => (
          <PropagationSettingsDrawer actionLabel="alterar" />
        ))
      }

      // Step 3: Build items list (filtered by original_user_id per D-09/SEL-02)
      const eligibleIds = getEligibleIds()
      const items: BulkProgressItem[] = eligibleIds.map((id) => {
        const tx = allTransactions.find((t) => t.id === id)
        return { id, label: tx?.description ?? String(id) }
      })

      if (items.length === 0) return

      // Step 4: Open progress drawer with update action
      void renderDrawer(() => (
        <BulkProgressDrawer
          items={items}
          action={async (item) => {
            const tx = allTransactions.find((t) => t.id === item.id)
            if (!tx) return
            const payload = buildFullPayload(tx, { category_id: category.id })
            if (tx.transaction_recurrence_id != null && propagation) {
              payload.propagation_settings = propagation
            }
            await updateTransaction(item.id, payload)
          }}
          titles={{
            processing: 'Alterando categoria...',
            success: 'Transações atualizadas',
            error: 'Erro ao atualizar',
          }}
          successMessage={(n) => n === 1 ? '1 transação atualizada com sucesso' : `${n} transações atualizadas com sucesso`}
          onInvalidate={invalidateTransactions}
          onSuccess={clearSelection}
          testIdPrefix="bulk_category"
        />
      ))
    } catch {
      // User dismissed a drawer (category selection or propagation) without confirming
    }
  }

  async function handleDateChange() {
    try {
      // Step 1: User picks a date
      const date = await renderDrawer<Date>(() => <SelectDateDrawer />)

      // Step 2: Check if any selected tx has recurrence -> show propagation drawer
      let propagation: PropagationSetting | undefined
      if (hasRecurring) {
        propagation = await renderDrawer<PropagationSetting>(() => (
          <PropagationSettingsDrawer actionLabel="alterar" />
        ))
      }

      // Step 3: Build items list (filtered by original_user_id per D-09/SEL-02)
      const eligibleIds = getEligibleIds()
      const items: BulkProgressItem[] = eligibleIds.map((id) => {
        const tx = allTransactions.find((t) => t.id === id)
        return { id, label: tx?.description ?? String(id) }
      })

      if (items.length === 0) return

      // Step 4: Format date as YYYY-MM-DD string for the API
      const yyyy = date.getFullYear()
      const mm = String(date.getMonth() + 1).padStart(2, '0')
      const dd = String(date.getDate()).padStart(2, '0')
      const dateStr = `${yyyy}-${mm}-${dd}`

      // Step 5: Open progress drawer with update action
      void renderDrawer(() => (
        <BulkProgressDrawer
          items={items}
          action={async (item) => {
            const tx = allTransactions.find((t) => t.id === item.id)
            if (!tx) return
            const payload = buildFullPayload(tx, { date: dateStr })
            if (tx.transaction_recurrence_id != null && propagation) {
              payload.propagation_settings = propagation
            }
            await updateTransaction(item.id, payload)
          }}
          titles={{
            processing: 'Alterando data...',
            success: 'Transações atualizadas',
            error: 'Erro ao atualizar',
          }}
          successMessage={(n) => n === 1 ? '1 transação atualizada com sucesso' : `${n} transações atualizadas com sucesso`}
          onInvalidate={invalidateTransactions}
          onSuccess={clearSelection}
          testIdPrefix="bulk_date"
        />
      ))
    } catch {
      // User dismissed a drawer (date selection or propagation) without confirming
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
            <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
              <PeriodNavigator month={search.month} year={search.year} onPeriodChange={(m, y) => routeNavigate({ search: { ...search, month: m, year: y } })} />
              <Group gap="xs" wrap="nowrap">
                <ActionIcon
                  size="lg"
                  variant="filled"
                  onClick={() => void renderDrawer(() => <CreateTransactionDrawer />)}
                  data-testid="btn_new_transaction"
                  aria-label="Nova Transação"
                >
                  <IconPlus size={18} />
                </ActionIcon>
                <Menu shadow="md" width={200}>
                  <Menu.Target>
                    <ActionIcon size="lg" variant="default" aria-label="Mais opções">
                      <IconDots size={18} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<IconTableImport size={14} />}
                      onClick={() => void navigate({ to: '/transactions/import' })}
                    >
                      Importar transações
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
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
            onCategoryChange={handleCategoryChange}
            onDateChange={handleDateChange}
            onDelete={handleDeleteClick}
          />
        ) : (
          <MobileBottomBar>
            <ClearFiltersButton variant="icon" />
            <ActionIcon
              size="lg"
              radius="xl"
              variant="filled"
              onClick={openFilters}
              aria-label="Abrir filtros"
            >
              <IconFilter size={18} />
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
            <PeriodNavigator month={search.month} year={search.year} onPeriodChange={(m, y) => routeNavigate({ search: { ...search, month: m, year: y } })} />
            <Group gap="xs">
              <Button leftSection={<IconPlus size={16} />} onClick={() => void renderDrawer(() => <CreateTransactionDrawer />)} data-testid="btn_new_transaction">
                Nova Transação
              </Button>
              <Menu shadow="md" width={200}>
                <Menu.Target>
                  <ActionIcon variant="default" aria-label="Mais opções">
                    <IconDots size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconTableImport size={14} />}
                    onClick={() => void navigate({ to: '/transactions/import' })}
                  >
                    Importar transações
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
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
          onCategoryChange={handleCategoryChange}
          onDateChange={handleDateChange}
          onDelete={handleDeleteClick}
        />
      )}

    </Stack>
  )
}
