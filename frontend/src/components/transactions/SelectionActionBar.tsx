import { Button, Group, Menu, Stack, Text } from '@mantine/core'
import { IconCalendar, IconCategory, IconChevronDown, IconShare, IconTrash } from '@tabler/icons-react'
import classes from './SelectionActionBar.module.css'
import { TransactionsTestIds } from '@/testIds'
import { formatSignedCents } from '@/utils/formatCents'
import { tapHaptic, warningHaptic } from '@/utils/haptics'

interface SelectionActionBarProps {
  count: number
  /** Signed sum (in cents) of every selected transaction + settlement. */
  totalCents: number
  onClearSelection: () => void
  onCategoryChange: () => void
  onDateChange: () => void
  onDivisaoChange: () => void
  connectedAccountsCount: number
  onDelete: () => void
  /** `inline` flows in the document; `fixed` (default) pins to the viewport bottom. */
  variant?: 'fixed' | 'inline'
}

/**
 * Action bar shown while the user has rows selected. Default `fixed` variant
 * sits at the bottom of the viewport (above the safe area); the `inline`
 * variant flows in the document so it can take the slot of the filter row in
 * the sticky header. Mirrors the variation C layout in both variants:
 * a Limpar action on the left, a centered count chip in the brand's
 * blue-glow tint, and a primary Ações menu on the right.
 */
export function SelectionActionBar({
  count,
  totalCents,
  onClearSelection,
  onCategoryChange,
  onDateChange,
  onDivisaoChange,
  connectedAccountsCount,
  onDelete,
  variant = 'fixed',
}: SelectionActionBarProps) {
  const className = variant === 'inline' ? `${classes.bar} ${classes.barInline}` : classes.bar
  const totalColor = totalCents > 0 ? 'teal.7' : totalCents < 0 ? 'red.7' : 'blue.7'
  const countLabel = count === 1 ? 'selecionada' : 'selecionadas'
  const formattedTotal = formatSignedCents(totalCents)
  return (
    <div className={className} data-testid={TransactionsTestIds.SelectionActionBar}>
      <Group align="center" wrap="nowrap" style={{ flex: 1 }} gap="sm">
        <Button
          variant="default"
          size="sm"
          radius="xl"
          onClick={() => { tapHaptic(); onClearSelection(); }}
          data-testid={TransactionsTestIds.BtnClearSelection}
        >
          Limpar
        </Button>

        <div className={classes.countPill} style={{ flex: 1 }}>
          {variant === 'inline' ? (
            <Stack gap={0} align="center">
              <Text size="sm" fw={700} c={totalColor} style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                {formattedTotal}
              </Text>
              <Text c="blue.7" fw={500} style={{ fontSize: '0.625rem', lineHeight: 1.1 }}>
                <span data-testid={TransactionsTestIds.SelectionCount}>{count}</span> {countLabel}
              </Text>
            </Stack>
          ) : (
            <Text size="sm" fw={600} component="span">
              <span style={{ fontWeight: 700, color: `var(--mantine-color-${totalColor.replace('.', '-')})`, fontVariantNumeric: 'tabular-nums' }}>
                {formattedTotal}
              </span>{' '}
              <span style={{ color: 'var(--mantine-color-blue-7)' }}>
                (<span data-testid={TransactionsTestIds.SelectionCount}>{count}</span> {countLabel})
              </span>
            </Text>
          )}
        </div>

        <Menu shadow="md" width={220} position="top-end">
          <Menu.Target>
            <Button
              size="sm"
              variant="filled"
              color="blue"
              radius="xl"
              rightSection={<IconChevronDown size={14} />}
              data-testid={TransactionsTestIds.BtnBulkActionsMenu}
            >
              Ações
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconCategory size={14} />}
              onClick={() => { tapHaptic(); onCategoryChange(); }}
              data-testid={TransactionsTestIds.BtnBulkCategory}
            >
              Alterar categoria
            </Menu.Item>
            <Menu.Item
              leftSection={<IconCalendar size={14} />}
              onClick={() => { tapHaptic(); onDateChange(); }}
              data-testid={TransactionsTestIds.BtnBulkDate}
            >
              Alterar data
            </Menu.Item>
            <Menu.Item
              leftSection={<IconShare size={14} />}
              onClick={connectedAccountsCount === 0 ? undefined : () => { tapHaptic(); onDivisaoChange(); }}
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
              onClick={() => { warningHaptic(); onDelete(); }}
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
