import { Button, Group, Menu, Text } from '@mantine/core'
import { IconCalendar, IconCategory, IconChevronDown, IconShare, IconTrash, IconX } from '@tabler/icons-react'
import classes from './SelectionActionBar.module.css'
import { TransactionsTestIds } from '@/testIds'

interface SelectionActionBarProps {
  count: number
  onClearSelection: () => void
  onCategoryChange: () => void
  onDateChange: () => void
  onDivisaoChange: () => void
  connectedAccountsCount: number
  onDelete: () => void
}

export function SelectionActionBar({ count, onClearSelection, onCategoryChange, onDateChange, onDivisaoChange, connectedAccountsCount, onDelete }: SelectionActionBarProps) {
  return (
    <div className={classes.bar} data-testid={TransactionsTestIds.SelectionActionBar}>
      <Group justify="space-between" align="center" style={{ flex: 1 }}>
        <Group gap="xs" align="center">
          <Text size="sm" fw={700} data-testid={TransactionsTestIds.SelectionCount}>
            {count}
          </Text>
          <Button
            size="compact-sm"
            variant="subtle"
            leftSection={<IconX size={14} />}
            onClick={onClearSelection}
            data-testid={TransactionsTestIds.BtnClearSelection}
          >
            Limpar seleção
          </Button>
        </Group>
        <Menu shadow="md" width={200}>
          <Menu.Target>
            <Button
              size="sm"
              variant="default"
              rightSection={<IconChevronDown size={14} />}
              data-testid={TransactionsTestIds.BtnBulkActionsMenu}
            >
              Ações
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconCategory size={14} />}
              onClick={onCategoryChange}
              data-testid={TransactionsTestIds.BtnBulkCategory}
            >
              Alterar categoria
            </Menu.Item>
            <Menu.Item
              leftSection={<IconCalendar size={14} />}
              onClick={onDateChange}
              data-testid={TransactionsTestIds.BtnBulkDate}
            >
              Alterar data
            </Menu.Item>
            <Menu.Item
              leftSection={<IconShare size={14} />}
              onClick={connectedAccountsCount === 0 ? undefined : onDivisaoChange}
              disabled={connectedAccountsCount === 0}
              data-testid={TransactionsTestIds.BtnBulkDivision}
            >
              Divisão
            </Menu.Item>
            {connectedAccountsCount === 0 && (
              <Text size="xs" c="dimmed" px="sm" pb="xs" data-testid={TransactionsTestIds.HintBulkDivisionNoConnection}>
                Conecte uma conta para usar esta ação.
              </Text>
            )}
            <Menu.Divider />
            <Menu.Item
              leftSection={<IconTrash size={14} color="var(--mantine-color-red-5)" />}
              onClick={onDelete}
              data-testid={TransactionsTestIds.BtnBulkDelete}
            >
              Excluir
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </div>
  )
}
