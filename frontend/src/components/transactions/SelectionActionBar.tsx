import { ActionIcon, Button, Group, Menu, Text } from '@mantine/core'
import { IconCalendar, IconCategory, IconChevronDown, IconTrash, IconX } from '@tabler/icons-react'
import classes from './SelectionActionBar.module.css'

interface SelectionActionBarProps {
  count: number
  onClearSelection: () => void
  onCategoryChange: () => void
  onDateChange: () => void
  onDelete: () => void
}

export function SelectionActionBar({ count, onClearSelection, onCategoryChange, onDateChange, onDelete }: SelectionActionBarProps) {
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
        <Menu shadow="md" width={200}>
          <Menu.Target>
            <Button
              size="sm"
              variant="default"
              rightSection={<IconChevronDown size={14} />}
              data-testid="btn_bulk_actions_menu"
            >
              Ações
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconCategory size={14} />}
              onClick={onCategoryChange}
              data-testid="btn_bulk_category"
            >
              Alterar categoria
            </Menu.Item>
            <Menu.Item
              leftSection={<IconCalendar size={14} />}
              onClick={onDateChange}
              data-testid="btn_bulk_date"
            >
              Alterar data
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              leftSection={<IconTrash size={14} color="var(--mantine-color-red-5)" />}
              onClick={onDelete}
              data-testid="btn_bulk_delete"
            >
              Excluir
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </div>
  )
}
