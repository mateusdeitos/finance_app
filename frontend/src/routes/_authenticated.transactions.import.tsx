import { useCallback, useReducer, useRef } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Code,
  FileInput,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { IconAlertCircle, IconArrowLeft, IconFileTypeCsv } from '@tabler/icons-react'
import { createFileRoute, useBlocker, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { createTransaction } from '@/api/transactions'
import { useAccounts } from '@/hooks/useAccounts'
import { useParseImportCSV } from '@/hooks/useParseImportCSV'
import { useTransactions } from '@/hooks/useTransactions'
import { Transactions } from '@/types/transactions'
import { parseApiError } from '@/utils/apiErrors'
import { ImportReviewRow } from '@/components/transactions/import/ImportReviewRow'
import { ImportCSVBulkToolbar } from '@/components/transactions/import/ImportCSVBulkToolbar'
import { ImportConfirmButton } from '@/components/transactions/import/ImportConfirmButton'

export const Route = createFileRoute('/_authenticated/transactions/import')({
  component: ImportReviewPage,
})

// ─── CSV column reference ──────────────────────────────────────────────────────

const CSV_COLUMNS = [
  { col: 'Data', required: true, description: 'Formato DD/MM/AAAA' },
  { col: 'Descrição', required: true, description: 'Texto livre' },
  { col: 'Tipo', required: true, description: 'despesa, receita ou transferência' },
  { col: 'Valor', required: true, description: 'Ex: 1234,56 ou 1.234,56' },
  { col: 'Categoria', required: false, description: 'Nome da categoria (obrigatório se não for transferência)' },
  { col: 'Conta Destino', required: false, description: 'Nome da conta (obrigatório se for transferência)' },
  { col: 'Tipo de Parcelamento', required: false, description: 'diário, semanal, mensal ou anual' },
  { col: 'Quantidade de Parcelas', required: false, description: 'Número inteiro (obrigatório se parcelamento definido)' },
]

// ─── Reducer ──────────────────────────────────────────────────────────────────

type PageStep = 'upload' | 'review'

type ImportState = {
  step: PageStep
  rows: Transactions.ImportRowState[]
  accountId: number
  selected: Set<number>
  importing: boolean
  paused: boolean
}

type ImportAction =
  | { type: 'INIT'; rows: Transactions.ParsedImportRow[]; accountId: number }
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
    case 'INIT':
      return {
        step: 'review',
        accountId: action.accountId,
        rows: action.rows.map((r) => ({
          ...r,
          action: r.status === 'duplicate' ? 'duplicate' : 'import',
          category_id: r.category_id ?? null,
          destination_account_id: r.destination_account_id ?? null,
          recurrence_type: r.recurrence_type ?? null,
          recurrence_count: r.recurrence_count ?? null,
          account_id: action.accountId,
          import_status: 'idle',
        })) as Transactions.ImportRowState[],
        selected: new Set(),
        importing: false,
        paused: false,
      }
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

const initialState: ImportState = {
  step: 'upload',
  rows: [],
  accountId: 0,
  selected: new Set(),
  importing: false,
  paused: false,
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ImportReviewPage() {
  const navigate = useNavigate()

  const { invalidate: invalidateTransactions } = useTransactions({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  })

  const abortRef = useRef<AbortController | null>(null)

  const [state, dispatch] = useReducer(importReducer, initialState)

  const hasPendingRows = state.step === 'review' && state.rows.some(
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

  const allSelected =
    state.rows.length > 0 && state.selected.size === state.rows.length
  const someSelected = state.selected.size > 0

  return (
    <Stack gap="md" pb="2rem">
      {state.step === 'upload' ? (
        <UploadStep
          onParsed={(rows, accountId) => dispatch({ type: 'INIT', rows, accountId })}
          onBack={() => void navigate({ to: '/transactions' })}
        />
      ) : (
        <>
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
        </>
      )}
    </Stack>
  )
}

// ─── Upload Step ───────────────────────────────────────────────────────────────

interface UploadStepProps {
  onParsed: (rows: Transactions.ParsedImportRow[], accountId: number) => void
  onBack: () => void
}

function UploadStep({ onParsed, onBack }: UploadStepProps) {
  const [accountId, setAccountId] = useState<number | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { query: accountsQuery } = useAccounts()
  const accounts = accountsQuery.data ?? []

  const ownAccountOptions = accounts
    .filter((a) => !a.user_connection && a.is_active)
    .map((a) => ({ value: String(a.id), label: a.name }))

  const { mutation } = useParseImportCSV()

  function handleSubmit() {
    setErrorMessage(null)

    if (!file) {
      setErrorMessage('Selecione um arquivo CSV.')
      return
    }
    if (!accountId) {
      setErrorMessage('Selecione uma conta.')
      return
    }

    mutation.mutate(
      { file, accountId },
      {
        onSuccess: (result) => {
          onParsed(result.rows, accountId)
        },
        onError: async (err: unknown) => {
          if (err instanceof Response) {
            const apiError = await parseApiError(err)
            const tag = apiError.tags[0] as string | undefined
            const message =
              (tag ? Transactions.IMPORT_ERROR_MESSAGES[tag] : undefined) ??
              apiError.message ??
              'Erro ao processar o arquivo.'
            setErrorMessage(message)
          } else {
            setErrorMessage('Erro ao processar o arquivo.')
          }
        },
      },
    )
  }

  return (
    <Stack gap="md" maw={640}>
      {/* Header */}
      <Group gap="xs">
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={onBack}
          size="sm"
        >
          Voltar
        </Button>
        <Title order={4}>Importar Transações</Title>
      </Group>

      {/* Account selection */}
      <Select
        label="Conta"
        placeholder="Selecione uma conta"
        required
        data={ownAccountOptions}
        value={accountId ? String(accountId) : null}
        onChange={(val) => setAccountId(val ? Number(val) : null)}
        searchable
      />

      {/* File input */}
      <FileInput
        label="Arquivo CSV"
        placeholder="Clique para selecionar"
        required
        accept=".csv,text/csv"
        leftSection={<IconFileTypeCsv size={16} />}
        value={file}
        onChange={setFile}
      />

      {/* Error message */}
      {errorMessage && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" title="Erro">
          {errorMessage}
        </Alert>
      )}

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        loading={mutation.isPending}
        leftSection={mutation.isPending ? <Loader size="xs" /> : undefined}
        disabled={!file || !accountId}
      >
        Processar arquivo
      </Button>

      {/* CSV Format reference */}
      <Box mt="md">
        <Title order={6} mb="xs">
          Modelo de cabeçalho válido
        </Title>
        <Code block mb="xs">
          {CSV_COLUMNS.map((c) => c.col).join(',')}
        </Code>
        <Table withTableBorder withColumnBorders fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Coluna</Table.Th>
              <Table.Th>Obrigatório</Table.Th>
              <Table.Th>Descrição</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {CSV_COLUMNS.map((col) => (
              <Table.Tr key={col.col}>
                <Table.Td>
                  <Text fw={500} fz="xs">
                    {col.col}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text c={col.required ? 'red' : 'dimmed'} fz="xs">
                    {col.required ? 'Sim' : 'Não'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text fz="xs" c="dimmed">
                    {col.description}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
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
