import { useCallback, useRef, useState } from 'react'
import {
  Alert,
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
import { IconAlertCircle, IconArrowLeft, IconCircleCheck, IconExclamationMark } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { useBlocker, useNavigate } from '@tanstack/react-router'
import { useForm, useFieldArray, FormProvider, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { createTransaction } from '@/api/transactions'
import { useRedirectOnImportSuccess } from '@/hooks/import/useRedirectOnImportSuccess'
import { Transactions } from '@/types/transactions'
import { parseApiError } from '@/utils/apiErrors'
import { QueryKeys } from '@/utils/queryKeys'
import { ImportReviewRow } from '@/components/transactions/import/ImportReviewRow'
import { ImportCSVBulkToolbar } from '@/components/transactions/import/ImportCSVBulkToolbar'
import { ImportConfirmButton } from '@/components/transactions/import/ImportConfirmButton'
import { UploadStep } from '@/components/transactions/import/UploadStep'
import { buildPayload, parsedRowToFormValues } from '@/components/transactions/import/importPayload'
import {
  importFormSchema,
  type ImportFormValues,
} from '@/components/transactions/form/importFormSchema'
import { ImportTestIds } from '@/testIds'

export function ImportTransactionsPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'upload' | 'review'>('upload')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [importState, setImportState] = useState({
    importing: false,
    paused: false,
  })
  const pauseRef = useRef(false)
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map())

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    defaultValues: { accountId: 0, rows: [] },
  })

  const { totalSuccess, total, errorCount, toImportPendingCount } = useWatch({
    control: form.control,
    name: 'rows',
    compute: (rows) => {
      const toImport = rows.filter((r) => r.action === 'import')
      return {
        total: toImport.length,
        totalSuccess: toImport.filter((r) => r.import_status === 'success').length,
        errorCount: toImport.filter((r) => r.import_status === 'error').length,
        toImportPendingCount: toImport.filter((r) => r.import_status !== 'success').length,
      }
    },
  })

  const { fields, remove } = useFieldArray({
    control: form.control,
    name: 'rows',
  })

  const queryClient = useQueryClient()
  const invalidateTransactions = () => queryClient.invalidateQueries({ queryKey: [QueryKeys.Transactions] })

  const importing = importState.importing
  const paused = importState.paused

  const {
    status: blockerStatus,
    proceed,
    reset: resetBlocker,
  } = useBlocker({
    blockerFn: () => true,
    condition: importing,
  })

  const blockMessage = importing
    ? 'A importação está em andamento. Ao sair ela será pausada e os dados serão perdidos. Deseja continuar?'
    : 'Você tem transações não importadas. Os dados serão perdidos ao sair. Deseja continuar?'

  // ─── Selection helpers ──────────────────────────────────────────────────────

  const handleToggleSelect = useCallback((index: number, shiftKey: boolean) => {
    const getNewSet = (prev: Set<number>, index: number): Set<number> => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    }

    if (!shiftKey) {
      setSelected((prev) => getNewSet(prev, index))
      return
    }

    setSelected((prev) => {
      const next = getNewSet(prev, index)
      const selecting = next.has(index)

      let nearestAbove = -1
      for (let i = index - 1; i >= 0; i--) {
        if (prev.has(i)) {
          nearestAbove = i
          break
        }
      }

      const start = nearestAbove + 1
      for (let i = start; i < index; i++) {
        if (selecting) {
          next.add(i)
        } else {
          next.delete(i)
        }
      }

      return next
    })
  }, [])

  const handleSelectAll = () => setSelected(new Set(fields.map((_, i) => i)))
  const handleClearSelection = () => setSelected(new Set())

  // ─── Bulk actions ───────────────────────────────────────────────────────────

  const handleBulkSetAction = (action: Transactions.ImportRowAction) => {
    selected.forEach((i) => {
      form.setValue(`rows.${i}.action`, action)
    })
    setSelected(new Set())
  }

  const handleBulkSetDate = (date: string) => {
    selected.forEach((i) => {
      form.setValue(`rows.${i}.date`, date)
    })
    setSelected(new Set())
  }

  const handleBulkSetCategory = (categoryId: number) => {
    selected.forEach((i) => {
      form.setValue(`rows.${i}.category_id`, categoryId)
    })
    setSelected(new Set())
  }

  const handleBulkSetTransactionType = (type: Transactions.TransactionType) => {
    selected.forEach((i) => {
      form.setValue(`rows.${i}.transaction_type`, type)
    })
    setSelected(new Set())
  }

  const handleSetDescription = (description: string) => {
    selected.forEach((i) => {
      form.setValue(`rows.${i}.description`, description)
    })
    setSelected(new Set())
  }

  const handleRemoveSelected = () => {
    const sorted = [...selected].sort((a, b) => b - a)
    sorted.forEach((i) => remove(i))
    setSelected(new Set())
  }

  const handleSetSplitSettings = (splitSettings: Transactions.SplitSetting[]) => {
    selected.forEach((i) => {
      const type = form.getValues(`rows.${i}.transaction_type`)
      if (type === 'transfer') {
        return
      }

      const amount = form.getValues(`rows.${i}.amount`)
      const parsedSplitSettings: Transactions.SplitSetting[] = splitSettings.map((s) => {
        const calculatedAmount = s.amount ? s.amount : Math.round((amount * (s?.percentage ?? 0)) / 100)
        return {
          connection_id: s.connection_id,
          amount: calculatedAmount,
        }
      })

      form.setValue(`rows.${i}.split_settings`, parsedSplitSettings)
    })
  }

  // ─── Import loop ────────────────────────────────────────────────────────────

  const handlePause = () => {
    pauseRef.current = true
  }

  const start = () => setImportState((p) => ({ ...p, importing: true, paused: false }))
  const pause = () => setImportState((p) => ({ ...p, importing: false, paused: true }))
  const finish = () => setImportState((p) => ({ ...p, importing: false, paused: false }))

  const isDone = !importing && !paused && totalSuccess + errorCount > 0
  const allImportedSuccess = isDone && total > 0 && totalSuccess === total

  useRedirectOnImportSuccess(allImportedSuccess)

  async function handleConfirm() {
    const isValid = await form.trigger('rows')
    if (!isValid) {
      const rowErrors = form.formState.errors.rows as (object | undefined)[] | undefined
      const errorRowCount = rowErrors?.filter((e) => e !== undefined).length ?? 0

      notifications.show({
        color: 'red',
        icon: <IconExclamationMark size={16} />,
        title: 'Erros na importação',
        message: `${errorRowCount} linha${errorRowCount !== 1 ? 's' : ''} com erros de validação. Corrija antes de importar.`,
      })

      if (rowErrors) {
        const firstErrorIndex = rowErrors.findIndex((e) => e !== undefined)
        if (firstErrorIndex >= 0) {
          rowRefs.current.get(firstErrorIndex)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
      return
    }

    const currentRows = form.getValues('rows')
    pauseRef.current = false
    start()

    for (let i = 0; i < currentRows.length; i++) {
      if (pauseRef.current) break

      const row = form.getValues(`rows.${i}`)
      if (row.action !== 'import' || row.import_status === 'success') continue

      form.setValue(`rows.${i}.import_status`, 'loading')

      try {
        await createTransaction(buildPayload(row))
        form.setValue(`rows.${i}.import_status`, 'success')
      } catch (err: unknown) {
        let errorMsg = 'Erro ao importar'
        if (err instanceof Response) {
          const apiError = await parseApiError(err)
          errorMsg = apiError.message || errorMsg
        }
        form.setValue(`rows.${i}.import_status`, 'error')
        form.setValue(`rows.${i}.import_error`, errorMsg)
      }
    }

    if (pauseRef.current) {
      pause()
    } else {
      const finalRows = form.getValues('rows')
      const { successIndices, hasErrors } = finalRows.reduce<{ successIndices: number[]; hasErrors: boolean }>(
        (acc, r, i) => {
          if (r.import_status === 'success') acc.successIndices.push(i)
          if (r.action === 'import' && r.import_status === 'error') acc.hasErrors = true
          return acc
        },
        { successIndices: [], hasErrors: false },
      )

      if (hasErrors) remove(successIndices)

      finish()
      invalidateTransactions()
    }
  }

  const allSelected = fields.length > 0 && selected.size === fields.length
  const someSelected = selected.size > 0

  return (
    <FormProvider {...form}>
      <Stack gap="md" pb="2rem">
        {step === 'upload' ? (
          <UploadStep
            onParsed={(parsedRows, accountId) => {
              form.reset({
                accountId,
                rows: parsedRows.map((r) => parsedRowToFormValues(r, accountId)),
              })
              setStep('review')
              setSelected(new Set())
              finish()
            }}
            onBack={() => void navigate({ to: '/transactions' })}
          />
        ) : allImportedSuccess ? (
          <Stack align="center" justify="center" gap="xs" py="xl" data-testid={ImportTestIds.FinishedStep}>
            <IconCircleCheck size={64} color="var(--mantine-color-green-6)" />
            <Text fw={500} fz="lg">
              Importação concluída com sucesso!
            </Text>
            <Text fz="sm" c="dimmed">
              Redirecionando para transações...
            </Text>
          </Stack>
        ) : (
          <Stack gap="md" data-testid={ImportTestIds.ReviewStep}>
            <Group justify="space-between" align="center" wrap="nowrap">
              <Group gap="xs">
                <Button
                  variant="subtle"
                  leftSection={<IconArrowLeft size={16} />}
                  onClick={() => void navigate({ to: '/transactions' })}
                  size="sm"
                  disabled={importing}
                >
                  Voltar
                </Button>
                <Title order={4}>Revisão da importação</Title>
              </Group>

              <Group gap="xs">
                <Text fz="sm" c="dimmed">
                  {fields.length} linha{fields.length !== 1 ? 's' : ''} · {total} para importar
                </Text>
                <ImportConfirmButton
                  importing={importing}
                  paused={paused}
                  toImportCount={toImportPendingCount}
                  onPause={handlePause}
                  onConfirm={() => void handleConfirm()}
                />
              </Group>
            </Group>

            {isDone && errorCount > 0 && (
              <Alert icon={<IconAlertCircle size={16} />} color="yellow" title="Importação concluída com erros">
                {errorCount} transaç{errorCount !== 1 ? 'ões' : 'ão'} com erro. Corrija e tente importar novamente.
              </Alert>
            )}

            <Paper p="xs" withBorder style={{ visibility: someSelected && !importing ? 'visible' : 'hidden' }}>
              <ImportCSVBulkToolbar
                selectedCount={selected.size}
                onRemove={handleRemoveSelected}
                onBulkSetAction={handleBulkSetAction}
                onBulkSetDate={handleBulkSetDate}
                onBulkSetCategory={handleBulkSetCategory}
                onBulkSetTransactionType={handleBulkSetTransactionType}
                onBulkSetDescription={handleSetDescription}
                onBulkSetSplitSettings={handleSetSplitSettings}
              />
            </Paper>

            <ScrollArea>
              <Table withTableBorder withColumnBorders verticalSpacing="xs" fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th
                      w={36}
                      style={{ cursor: 'pointer' }}
                      onClick={allSelected ? handleClearSelection : handleSelectAll}
                    >
                      <Checkbox
                        size="xs"
                        checked={allSelected}
                        indeterminate={someSelected && !allSelected}
                        onChange={allSelected ? handleClearSelection : handleSelectAll}
                        disabled={importing}
                        styles={{ input: { cursor: 'pointer' } }}
                      />
                    </Table.Th>
                    <Table.Th w={36} />
                    <Table.Th>Data</Table.Th>
                    <Table.Th>Descrição</Table.Th>
                    <Table.Th>Valor</Table.Th>
                    <Table.Th>Tipo</Table.Th>
                    <Table.Th>Categoria</Table.Th>
                    <Table.Th>Conta Destino</Table.Th>
                    <Table.Th>Parcelamento</Table.Th>
                    <Table.Th>Divisão</Table.Th>
                    <Table.Th>Ação</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {fields.map((field, i) => (
                    <ImportReviewRow
                      key={field.id}
                      ref={(el) => {
                        if (el) rowRefs.current.set(i, el)
                        else rowRefs.current.delete(i)
                      }}
                      rowIndex={i}
                      selected={selected.has(i)}
                      disabled={importing && !paused}
                      onToggleSelect={handleToggleSelect}
                    />
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>

            <Modal
              opened={blockerStatus === 'blocked'}
              onClose={() => resetBlocker?.()}
              title="Atenção"
              centered
              size="sm"
            >
              <Stack gap="md">
                <Text fz="sm">{blockMessage}</Text>
                <Group justify="flex-end" gap="xs">
                  <Button variant="default" onClick={() => resetBlocker?.()}>
                    Cancelar
                  </Button>
                  <Button color="red" onClick={() => proceed?.()}>
                    Sair mesmo assim
                  </Button>
                </Group>
              </Stack>
            </Modal>
          </Stack>
        )}
      </Stack>
    </FormProvider>
  )
}
