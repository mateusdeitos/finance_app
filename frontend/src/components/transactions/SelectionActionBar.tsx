import { ActionIcon, Button, Group, Text } from '@mantine/core'
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
      <ActionIcon
        className={classes.closeButton}
        variant="default"
        radius="xl"
        size="md"
        onClick={onClearSelection}
        data-testid="btn_clear_selection"
        aria-label="Limpar seleção"
      >
        <IconX size={14} />
      </ActionIcon>
      <Group justify="space-between" align="center">
        <Text size="sm" fw={700} data-testid="selection_count">
          {count}
        </Text>
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
    </div>
  )
}
