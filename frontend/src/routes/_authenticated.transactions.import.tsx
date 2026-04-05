import { useCallback, useReducer, useRef, useEffect } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react'
import { createFileRoute, useBlocker, useNavigate, useRouterState } from '@tanstack/react-router'
import { createTransaction } from '@/api/transactions'
import { useTransactions } from '@/hooks/useTransactions'
import { Transactions } from '@/types/transactions'
import { localDateStr } from '@/utils/parseDate'
import { parseApiError } from '@/utils/apiErrors'
import { ImportReviewRow } from '@/components/transactions/import/ImportReviewRow'
import { ImportCSVBulkToolbar } from '@/components/transactions/import/ImportCSVBulkToolbar'
import { ImportConfirmButton } from '@/components/transactions/import/ImportConfirmButton'

export const Route = createFileRoute('/_authenticated/transactions/import')({
  component: ImportReviewPage,
})

// ─── Reducer ──────────────────────────────────────────────────────────────────

type ImportState = {
  rows: Transactions.ImportRowState[]
  selected: Set<number>
  importing: boolean
  paused: boolean
}

type ImportAction =
  | { type: 'UPDATE_ROW'; index: number; patch: Partial<Transactions.ImportRowState> }
  | { type: 'REMOVE_ROWS'; indices: Set<number> }
  | { type: 'BULK_UPDATE'; indices: Set<number>; patch: Partial<Transactions.ImportRowState> }
  | { type: 'TOGGLE_SELECT'; index: number }
  | { type: 'SELECT_ALL' }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SET_IMPORTING'; value: boolean }
  | { type: 'SET_PAUSED'; value: boolean }

function importReducer(state: ImportState, action: ImportAction): ImportState {
  switch (action.type) {
    case 'UPDATE_ROW':
      return {
        ...state,
        rows: state.rows.map((r, i) => (i === action.index ? { ...r, ...action.patch } : r)),
      }
    case 'REMOVE_ROWS':
      return {
        ...state,
        rows: state.rows.filter((_, i) => !action.indices.has(i)),
        selected: new Set(),
      }
    case 'BULK_UPDATE':
      return {
        ...state,
        rows: state.rows.map((r, i) =>
          action.indices.has(i) ? { ...r, ...action.patch } : r,
        ),
      }
    case 'TOGGLE_SELECT': {
      const next = new Set(state.selected)
      if (next.has(action.index)) next.delete(action.index)
      else next.add(action.index)
      return { ...state, selected: next }
    }
    case 'SELECT_ALL':
      return { ...state, selected: new Set(state.rows.map((_, i) => i)) }
    case 'CLEAR_SELECTION':
      return { ...state, selected: new Set() }
    case 'SET_IMPORTING':
      return { ...state, importing: action.value }
    case 'SET_PAUSED':
      return { ...state, paused: action.value }
  }
}

function initState(
  parseResult: Transactions.ParsedImportRow[],
  accountId: number,
): ImportState {
  return {
    rows: parseResult.map((r) => ({
      row_index: r.row_index,
      action: r.status === 'duplicate' ? 'duplicate' : 'import',
      date: r.date ? r.date.substring(0, 10) : localDateStr(new Date()),
      description: r.description,
      type: r.type,
      amount: r.amount,
      account_id: accountId,
      category_id: r.category_id ?? null,
      destination_account_id: r.destination_account_id ?? null,
      recurrence_type: r.recurrence_type ?? null,
      recurrence_count: r.recurrence_count ?? null,
      parse_errors: r.parse_errors ?? [],
      import_status: 'idle',
    })),
    selected: new Set(),
    importing: false,
    paused: false,
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ImportReviewPage() {
  const navigate = useNavigate()
  const routerState = useRouterState()
  const locationState = routerState.location.state as
    | { parseResult: Transactions.ParsedImportRow[]; accountId: number }
    | undefined

  const { invalidate: invalidateTransactions } = useTransactions({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  })

  const abortRef = useRef<AbortController | null>(null)

  // Redirect if no import data (direct URL access / page refresh)
  useEffect(() => {
    if (!locationState?.parseResult) {
      void navigate({ to: '/transactions', replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [state, dispatch] = useReducer(
    importReducer,
    locationState,
    (s) => initState(s?.parseResult ?? [], s?.accountId ?? 0),
  )

  const hasPendingRows = state.rows.some(
    (r) => r.action === 'import' && r.import_status !== 'success',
  )

  // Navigation blocker — active whenever there are unimported rows
  const { status: blockerStatus, proceed, reset: resetBlocker } = useBlocker({
    blockerFn: () => true,
    condition: hasPendingRows,
  })

  const blockMessage = state.importing
    ? 'A importação está em andamento. Ao sair ela será pausada e os dados serão perdidos. Deseja continuar?'
    : 'Você tem transações não importadas. Os dados serão perdidos ao sair. Deseja continuar?'

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleUpdateRow = useCallback((index: number, patch: Partial<Transactions.ImportRowState>) => {
    dispatch({ type: 'UPDATE_ROW', index, patch })
  }, [])

  const handleToggleSelect = useCallback((index: number) => {
    dispatch({ type: 'TOGGLE_SELECT', index })
  }, [])

  const handleSelectAll = () => dispatch({ type: 'SELECT_ALL' })
  const handleClearSelection = () => dispatch({ type: 'CLEAR_SELECTION' })

  const handleRemoveSelected = () => {
    dispatch({ type: 'REMOVE_ROWS', indices: state.selected })
  }

  const handleBulkSetAction = (action: Transactions.ImportRowAction) => {
    dispatch({ type: 'BULK_UPDATE', indices: state.selected, patch: { action } })
    dispatch({ type: 'CLEAR_SELECTION' })
  }

  const handleBulkSetDate = (date: string) => {
    dispatch({ type: 'BULK_UPDATE', indices: state.selected, patch: { date } })
    dispatch({ type: 'CLEAR_SELECTION' })
  }

  const handleBulkSetCategory = (categoryId: number) => {
    dispatch({ type: 'BULK_UPDATE', indices: state.selected, patch: { category_id: categoryId } })
    dispatch({ type: 'CLEAR_SELECTION' })
  }

  const toImportRows = state.rows.filter((r) => r.action === 'import')
  const importedCount = toImportRows.filter((r) => r.import_status === 'success').length
  const errorCount = toImportRows.filter((r) => r.import_status === 'error').length
  const isDone = !state.importing && !state.paused && (importedCount + errorCount) > 0

  async function handleConfirm() {
    const controller = new AbortController()
    abortRef.current = controller
    dispatch({ type: 'SET_IMPORTING', value: true })
    dispatch({ type: 'SET_PAUSED', value: false })

    for (let i = 0; i < state.rows.length; i++) {
      if (controller.signal.aborted) {
        dispatch({ type: 'SET_PAUSED', value: true })
        break
      }

      const row = state.rows[i]
      if (row.action !== 'import' || row.import_status === 'success') continue

      dispatch({ type: 'UPDATE_ROW', index: i, patch: { import_status: 'loading' } })

      try {
        await createTransaction(buildPayload(row))
        dispatch({ type: 'UPDATE_ROW', index: i, patch: { import_status: 'success' } })
      } catch (err: unknown) {
        let errorMsg = 'Erro ao importar'
        if (err instanceof Response) {
          const apiError = await parseApiError(err)
          errorMsg = apiError.message || errorMsg
        }
        dispatch({ type: 'UPDATE_ROW', index: i, patch: { import_status: 'error', import_error: errorMsg } })
      }
    }

    dispatch({ type: 'SET_IMPORTING', value: false })
    abortRef.current = null
    invalidateTransactions()
  }

  if (!locationState?.parseResult) {
    return null
  }

  const allSelected =
    state.rows.length > 0 && state.selected.size === state.rows.length
  const someSelected = state.selected.size > 0

  return (
    <Stack gap="md" pb="2rem">
      {/* Header */}
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="xs">
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => void navigate({ to: '/transactions' })}
            size="sm"
            disabled={state.importing}
          >
            Voltar
          </Button>
          <Title order={4}>Revisão da importação</Title>
        </Group>

        <Group gap="xs">
          <Text fz="sm" c="dimmed">
            {state.rows.length} linha{state.rows.length !== 1 ? 's' : ''} · {toImportRows.length} para importar
          </Text>
          <ImportConfirmButton
            importing={state.importing}
            paused={state.paused}
            toImportCount={toImportRows.filter((r) => r.import_status !== 'success').length}
            abortRef={abortRef}
            onConfirm={() => void handleConfirm()}
          />
        </Group>
      </Group>

      {/* Summary after done */}
      {isDone && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          color={errorCount > 0 ? 'yellow' : 'green'}
          title="Importação concluída"
        >
          {importedCount} transaç{importedCount !== 1 ? 'ões importadas' : 'ão importada'}.
          {errorCount > 0 && ` ${errorCount} com erro.`}
        </Alert>
      )}

      {/* Bulk toolbar */}
      {someSelected && !state.importing && (
        <Paper p="xs" withBorder>
          <ImportCSVBulkToolbar
            selectedCount={state.selected.size}
            onRemove={handleRemoveSelected}
            onBulkSetAction={handleBulkSetAction}
            onBulkSetDate={handleBulkSetDate}
            onBulkSetCategory={handleBulkSetCategory}
          />
        </Paper>
      )}

      {/* Table */}
      <ScrollArea>
        <Table withTableBorder withColumnBorders verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={36}>
                <Checkbox
                  size="xs"
                  checked={allSelected}
                  indeterminate={someSelected && !allSelected}
                  onChange={allSelected ? handleClearSelection : handleSelectAll}
                  disabled={state.importing}
                />
              </Table.Th>
              <Table.Th w={36} />
              <Table.Th>Ação</Table.Th>
              <Table.Th>Data</Table.Th>
              <Table.Th>Descrição</Table.Th>
              <Table.Th>Valor</Table.Th>
              <Table.Th>Tipo</Table.Th>
              <Table.Th>Categoria</Table.Th>
              <Table.Th>Conta Destino</Table.Th>
              <Table.Th>Parcelamento</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {state.rows.map((row, i) => (
              <ImportReviewRow
                key={row.row_index}
                row={row}
                index={i}
                selected={state.selected.has(i)}
                disabled={state.importing && !state.paused}
                onChange={handleUpdateRow}
                onToggleSelect={handleToggleSelect}
              />
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      {/* Navigation blocker modal */}
      <Modal
        opened={blockerStatus === 'blocked'}
        onClose={resetBlocker}
        title="Atenção"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text fz="sm">{blockMessage}</Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={resetBlocker}>
              Cancelar
            </Button>
            <Button color="red" onClick={proceed}>
              Sair mesmo assim
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPayload(row: Transactions.ImportRowState): Transactions.CreateTransactionPayload {
  const payload: Transactions.CreateTransactionPayload = {
    transaction_type: row.type,
    account_id: row.account_id,
    amount: row.amount,
    date: row.date,
    description: row.description,
  }

  if (row.category_id) {
    payload.category_id = row.category_id
  }

  if (row.type === 'transfer' && row.destination_account_id) {
    payload.destination_account_id = row.destination_account_id
  }

  if (row.recurrence_type && row.recurrence_count) {
    payload.recurrence_settings = {
      type: row.recurrence_type,
      repetitions: row.recurrence_count,
    }
  }

  return payload
}
