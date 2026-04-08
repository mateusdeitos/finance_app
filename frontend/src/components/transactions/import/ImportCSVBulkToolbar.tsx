import { useState } from 'react'
import { Button, Group, Popover, Select, Stack, Text } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { IconCalendar, IconCategory, IconPlayerSkipForward, IconTrash } from '@tabler/icons-react'
import { useCategories } from '@/hooks/useCategories'
import { Transactions } from '@/types/transactions'
import { localDateStr } from '@/utils/parseDate'

const ACTION_OPTIONS = [
  { value: 'import', label: 'Importar' },
  { value: 'skip', label: 'Não importar' },
  { value: 'duplicate', label: 'Duplicado' },
]

interface Props {
  selectedCount: number
  onRemove: () => void
  onBulkSetAction: (action: Transactions.ImportRowAction) => void
  onBulkSetDate: (date: string) => void
  onBulkSetCategory: (categoryId: number) => void
}

export function ImportCSVBulkToolbar({
  selectedCount,
  onRemove,
  onBulkSetAction,
  onBulkSetDate,
  onBulkSetCategory,
}: Props) {
  const { query: categoriesQuery } = useCategories()
  const categories = categoriesQuery.data ?? []

  const categoryOptions = categories.map((c) => ({
    value: String(c.id),
    label: c.emoji ? `${c.emoji} ${c.name}` : c.name,
  }))

  const [actionPopoverOpen, setActionPopoverOpen] = useState(false)
  const [datePopoverOpen, setDatePopoverOpen] = useState(false)
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false)

  return (
    <Group gap="xs" align="center">
      <Text fz="sm" fw={500}>
        {selectedCount} selecionadas
      </Text>

      <Button
        size="xs"
        variant="light"
        color="red"
        leftSection={<IconTrash size={14} />}
        onClick={onRemove}
        data-testid="btn_bulk_remove"
      >
        Remover
      </Button>

      <Popover opened={actionPopoverOpen} onChange={setActionPopoverOpen} withinPortal>
        <Popover.Target>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlayerSkipForward size={14} />}
            onClick={() => setActionPopoverOpen(true)}
          >
            Definir ação
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs" w={160}>
            <Select
              label="Ação"
              size="xs"
              data={ACTION_OPTIONS}
              withCheckIcon={false}
              data-testid="select_bulk_action"
              onChange={(val) => {
                if (val) {
                  onBulkSetAction(val as Transactions.ImportRowAction)
                  setActionPopoverOpen(false)
                }
              }}
            />
          </Stack>
        </Popover.Dropdown>
      </Popover>

      <Popover opened={datePopoverOpen} onChange={setDatePopoverOpen} withinPortal>
        <Popover.Target>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconCalendar size={14} />}
            onClick={() => setDatePopoverOpen(true)}
          >
            Definir data
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            <DatePickerInput
              label="Data"
              size="xs"
              valueFormat="DD/MM/YYYY"
              onChange={(d) => {
                if (d) {
                  onBulkSetDate(localDateStr(d))
                  setDatePopoverOpen(false)
                }
              }}
              popoverProps={{ withinPortal: true }}
            />
          </Stack>
        </Popover.Dropdown>
      </Popover>

      <Popover opened={categoryPopoverOpen} onChange={setCategoryPopoverOpen} withinPortal>
        <Popover.Target>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconCategory size={14} />}
            onClick={() => setCategoryPopoverOpen(true)}
          >
            Definir categoria
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs" w={200}>
            <Select
              label="Categoria"
              size="xs"
              data={categoryOptions}
              searchable
              withCheckIcon={false}
              onChange={(val) => {
                if (val) {
                  onBulkSetCategory(Number(val))
                  setCategoryPopoverOpen(false)
                }
              }}
            />
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Group>
  )
}
