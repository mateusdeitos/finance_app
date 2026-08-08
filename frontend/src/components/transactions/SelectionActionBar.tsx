import { Button, Group, Menu, Stack, Text } from '@mantine/core'
import { IconCalendar, IconCategory, IconChevronDown, IconShare, IconCheck, IconTrash, IconX } from '@tabler/icons-react'
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
  onMarkReviewed: () => void
  onUnmarkReviewed: () => void
  connectedAccountsCount: number
  onDelete: () => void
  /** `inline` flows in the document; `fixed` (default) pins to the viewport bottom. */
  variant?: 'fixed' | 'inline'
}

/**
 * Action bar shown while the user has rows selected. Default `fixed` variant
 * sits at the bottom of the viewport (above the safe area); the `inline`
 * variant flows in the document so it can take the slot of the filter row in
 * the sticky header.
 *
 * The `fixed` (desktop) variant lays the actions out as individual buttons to
 * the right of the Limpar action, since there is room for them; the `inline`
 * (mobile) variant keeps them behind a compact "Ações" dropdown to fit the
 * tight sticky-header slot.
 */
export function SelectionActionBar({
  count,
  totalCents,
  onClearSelection,
  onCategoryChange,
  onDateChange,
  onDivisaoChange,
  onMarkReviewed,
  onUnmarkReviewed,
  connectedAccountsCount,
  onDelete,
  variant = 'fixed',
}: SelectionActionBarProps) {
  const className = variant === 'inline' ? `${classes.bar} ${classes.barInline}` : classes.bar
  const totalColor = totalCents > 0 ? 'teal.7' : totalCents < 0 ? 'red.7' : 'blue.7'
  const countLabel = count === 1 ? 'selecionada' : 'selecionadas'
  const formattedTotal = formatSignedCents(totalCents)
  const divisionDisabled = connectedAccountsCount === 0

  const countPill = (
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
  )

  const clearButton = (
    <Button
      variant="default"
      size="sm"
      radius="xl"
      onClick={() => { tapHaptic(); onClearSelection(); }}
      data-testid={TransactionsTestIds.BtnClearSelection}
    >
      Limpar
    </Button>
  )

  // Desktop: actions rendered as inline buttons to the right of Limpar.
  if (variant === 'fixed') {
    return (
      <div className={className} data-testid={TransactionsTestIds.SelectionActionBar}>
        <Group align="center" wrap="nowrap" style={{ flex: 1 }} gap="sm">
          {clearButton}
          <Group gap="xs" wrap="nowrap">
            <Button
              variant="default"
              size="sm"
              radius="xl"
              leftSection={<IconCategory size={14} />}
              onClick={() => { tapHaptic(); onCategoryChange(); }}
              data-testid={TransactionsTestIds.BtnBulkCategory}
            >
              Categoria
            </Button>
            <Button
              variant="default"
              size="sm"
              radius="xl"
              leftSection={<IconCalendar size={14} />}
              onClick={() => { tapHaptic(); onDateChange(); }}
              data-testid={TransactionsTestIds.BtnBulkDate}
            >
              Data
            </Button>
            <Button
              variant="default"
              size="sm"
              radius="xl"
              leftSection={<IconShare size={14} />}
              onClick={divisionDisabled ? undefined : () => { tapHaptic(); onDivisaoChange(); }}
              disabled={divisionDisabled}
              data-testid={TransactionsTestIds.BtnBulkDivision}
            >
              Divisão
            </Button>
            {divisionDisabled && (
              <Text size="xs" c="dimmed" data-testid={TransactionsTestIds.HintBulkDivisionNoConnection}>
                Conecte uma conta para usar esta ação.
              </Text>
            )}
            <Button
              variant="default"
              size="sm"
              radius="xl"
              leftSection={<IconCheck size={14} />}
              onClick={() => { tapHaptic(); onMarkReviewed(); }}
              data-testid={TransactionsTestIds.BtnBulkMarkReviewed}
            >
              Marcar revisada
            </Button>
            <Button
              variant="default"
              size="sm"
              radius="xl"
              leftSection={<IconX size={14} />}
              onClick={() => { tapHaptic(); onUnmarkReviewed(); }}
              data-testid={TransactionsTestIds.BtnBulkUnmarkReviewed}
            >
              Desmarcar
            </Button>
            <Button
              variant="light"
              color="red"
              size="sm"
              radius="xl"
              leftSection={<IconTrash size={14} />}
              onClick={() => { warningHaptic(); onDelete(); }}
              data-testid={TransactionsTestIds.BtnBulkDelete}
            >
              Excluir
            </Button>
          </Group>
          {countPill}
        </Group>
      </div>
    )
  }

  // Mobile: compact "Ações" dropdown to fit the sticky-header slot.
  return (
    <div className={className} data-testid={TransactionsTestIds.SelectionActionBar}>
      <Group align="center" wrap="nowrap" style={{ flex: 1 }} gap="sm">
        {clearButton}
        {countPill}
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
              onClick={divisionDisabled ? undefined : () => { tapHaptic(); onDivisaoChange(); }}
              disabled={divisionDisabled}
              data-testid={TransactionsTestIds.BtnBulkDivision}
            >
              Divisão
            </Menu.Item>
            {divisionDisabled && (
              <Text size="xs" c="dimmed" px="sm" pb="xs" data-testid={TransactionsTestIds.HintBulkDivisionNoConnection}>
                Conecte uma conta para usar esta ação.
              </Text>
            )}
            <Menu.Divider />
            <Menu.Item
              leftSection={<IconCheck size={14} />}
              onClick={() => { tapHaptic(); onMarkReviewed(); }}
              data-testid={TransactionsTestIds.BtnBulkMarkReviewed}
            >
              Marcar como revisada
            </Menu.Item>
            <Menu.Item
              leftSection={<IconX size={14} />}
              onClick={() => { tapHaptic(); onUnmarkReviewed(); }}
              data-testid={TransactionsTestIds.BtnBulkUnmarkReviewed}
            >
              Desmarcar revisão
            </Menu.Item>
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
