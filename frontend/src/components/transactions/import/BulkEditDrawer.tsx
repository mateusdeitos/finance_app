import { Button, Select, Stack, TextInput } from '@mantine/core'
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form'
import { ResponsiveDrawer } from '@/components/ResponsiveDrawer'
import { ResponsiveDateInput } from '@/components/ResponsiveDateInput'
import { ResponsiveSelect } from '@/components/ResponsiveSelect'
import { useDrawerContext } from '@/utils/renderDrawer'
import { useFlattenCategories } from '@/hooks/useCategories'
import { SplitSettingsFields } from '../form/SplitSettingsFields'
import { Transactions } from '@/types/transactions'
import { ImportTestIds } from '@/testIds'

export type BulkEditAction =
  | 'date'
  | 'category_id'
  | 'description'
  | 'type'
  | 'import_action'
  | 'split'

export type BulkEditResult =
  | { type: 'date'; value: string }
  | { type: 'category_id'; value: number }
  | { type: 'description'; value: string }
  | { type: 'type'; value: Transactions.TransactionType }
  | { type: 'import_action'; value: Transactions.ImportRowAction }
  | { type: 'split'; value: Transactions.SplitSetting[] }

type LocalFormType = {
  date: string
  category_id: number | null
  description: string
  transaction_type: Transactions.TransactionType | null
  import_action: Transactions.ImportRowAction | null
  split_settings: Transactions.SplitSetting[]
}

const TITLES: Record<BulkEditAction, string> = {
  date: 'Alterar data',
  category_id: 'Alterar categoria',
  description: 'Alterar descrição',
  type: 'Alterar tipo de transação',
  import_action: 'Alterar ação de importação',
  split: 'Alterar divisão',
}

const TYPE_OPTIONS: { value: Transactions.TransactionType; label: string }[] = [
  { value: 'expense', label: 'Despesa' },
  { value: 'income', label: 'Receita' },
  { value: 'transfer', label: 'Transferência' },
]

const ACTION_OPTIONS: { value: Transactions.ImportRowAction; label: string }[] = [
  { value: 'import', label: 'Importar' },
  { value: 'skip', label: 'Não importar' },
]

interface Props {
  actionType: BulkEditAction
}

/**
 * Drawer that captures the value for a single bulk-edit action on the import
 * review step. Resolves via `close(result)` so the caller can dispatch the
 * matching `onBulkSet*` handler.
 */
export function BulkEditDrawer({ actionType }: Props) {
  const { opened, close, reject } = useDrawerContext<BulkEditResult | void>()
  const { query: categoriesQuery } = useFlattenCategories()
  const categories = categoriesQuery.data ?? []
  const categoryOptions = categories.map((c) => ({
    value: String(c.id),
    label: c.emoji ? `${c.emoji} ${c.name}` : c.name,
  }))

  const form = useForm<LocalFormType>({
    defaultValues: {
      date: '',
      category_id: null,
      description: '',
      transaction_type: null,
      import_action: null,
      split_settings: [],
    },
  })

  const values = useWatch({ control: form.control })

  const applyDisabled = (() => {
    switch (actionType) {
      case 'date':
        return !values.date
      case 'category_id':
        return !values.category_id
      case 'description':
        return !values.description?.trim()
      case 'type':
        return !values.transaction_type
      case 'import_action':
        return !values.import_action
      case 'split':
        return !values.split_settings?.length
    }
  })()

  function handleApply() {
    const v = form.getValues()
    switch (actionType) {
      case 'date':
        if (v.date) close({ type: 'date', value: v.date })
        break
      case 'category_id':
        if (v.category_id) close({ type: 'category_id', value: v.category_id })
        break
      case 'description':
        if (v.description.trim()) close({ type: 'description', value: v.description })
        break
      case 'type':
        if (v.transaction_type) close({ type: 'type', value: v.transaction_type })
        break
      case 'import_action':
        if (v.import_action) close({ type: 'import_action', value: v.import_action })
        break
      case 'split':
        if (v.split_settings.length) close({ type: 'split', value: v.split_settings })
        break
    }
  }

  return (
    <ResponsiveDrawer
      opened={opened}
      onClose={reject}
      title={TITLES[actionType]}
      data-testid={ImportTestIds.DrawerBulkEdit}
    >
      <FormProvider {...form}>
        <Stack gap="md">
          {actionType === 'date' && (
            <Controller
              name="date"
              control={form.control}
              render={({ field }) => (
                <ResponsiveDateInput
                  label="Data"
                  value={field.value}
                  onChange={field.onChange}
                  data-testid={ImportTestIds.InputBulkDate}
                />
              )}
            />
          )}

          {actionType === 'category_id' && (
            <Controller
              name="category_id"
              control={form.control}
              render={({ field }) => (
                <ResponsiveSelect
                  label="Categoria"
                  data={categoryOptions}
                  searchable
                  value={field.value ? String(field.value) : null}
                  onChange={(v) => field.onChange(v ? Number(v) : null)}
                  data-testid={ImportTestIds.SelectBulkCategory}
                />
              )}
            />
          )}

          {actionType === 'description' && (
            <Controller
              name="description"
              control={form.control}
              render={({ field }) => (
                <TextInput
                  label="Descrição"
                  value={field.value}
                  onChange={field.onChange}
                  data-testid={ImportTestIds.InputBulkDescription}
                />
              )}
            />
          )}

          {actionType === 'type' && (
            <Controller
              name="transaction_type"
              control={form.control}
              render={({ field }) => (
                <Select
                  label="Tipo de transação"
                  data={TYPE_OPTIONS}
                  value={field.value}
                  onChange={(v) => field.onChange(v as Transactions.TransactionType | null)}
                  data-testid={ImportTestIds.SelectBulkType}
                />
              )}
            />
          )}

          {actionType === 'import_action' && (
            <Controller
              name="import_action"
              control={form.control}
              render={({ field }) => (
                <Select
                  label="Ação de importação"
                  data={ACTION_OPTIONS}
                  value={field.value}
                  onChange={(v) => field.onChange(v as Transactions.ImportRowAction | null)}
                  data-testid={ImportTestIds.SelectBulkAction}
                />
              )}
            />
          )}

          {actionType === 'split' && (
            <SplitSettingsFields namePrefix="" comboboxWithinPortal onlyPercentage />
          )}

          <Button
            onClick={handleApply}
            disabled={applyDisabled}
            data-testid={ImportTestIds.BtnBulkApply}
          >
            Aplicar
          </Button>
        </Stack>
      </FormProvider>
    </ResponsiveDrawer>
  )
}
