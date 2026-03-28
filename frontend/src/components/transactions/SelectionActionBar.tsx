import { Button, Group, Text } from '@mantine/core'
import { IconTrash, IconX } from '@tabler/icons-react'
import classes from './SelectionActionBar.module.css'

interface SelectionActionBarProps {
  count: number
  onClearSelection: () => void
  onDelete: () => void
}

export function SelectionActionBar({ count, onClearSelection, onDelete }: SelectionActionBarProps) {
  return (
    <div className={classes.bar} data-testid="selection_action_bar">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={500} data-testid="selection_count">
          {count} selecionada{count !== 1 ? 's' : ''}
        </Text>
        <Group gap="sm">
          <Button
            variant="subtle"
            size="sm"
            leftSection={<IconX size={14} />}
            onClick={onClearSelection}
            data-testid="btn_clear_selection"
          >
            Desmarcar tudo
          </Button>
          <Button
            color="red"
            size="sm"
            leftSection={<IconTrash size={14} />}
            onClick={onDelete}
            data-testid="btn_bulk_delete"
          >
            Excluir
          </Button>
        </Group>
      </Group>
    </div>
  )
}
