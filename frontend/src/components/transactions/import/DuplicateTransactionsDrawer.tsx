import { Badge, Button, Card, Group, Stack, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { ResponsiveDrawer } from '@/components/ResponsiveDrawer'
import { useDrawerContext } from '@/utils/renderDrawer'
import { useAccountOptions } from '@/hooks/import/useImportOptions'
import { formatBalance } from '@/utils/formatCents'
import { Transactions } from '@/types/transactions'
import { ImportTestIds } from '@/testIds'

interface ImportingRow {
  date: string
  description: string
  amount: number
}

interface Props {
  row: ImportingRow
  matches: Transactions.Transaction[]
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

/**
 * Inspection drawer for a row flagged as a possible duplicate. Lists the
 * existing transactions that matched and lets the user mark the row as "not
 * imported" — resolved via `close('skip')` so the caller flips the row action.
 */
export function DuplicateTransactionsDrawer({ row, matches }: Props) {
  const { opened, close, reject } = useDrawerContext<'skip' | void>()
  const accountOptions = useAccountOptions()

  const accountName = (id: number) =>
    accountOptions.find((o) => o.value === String(id))?.label ?? `Conta ${id}`

  return (
    <ResponsiveDrawer
      opened={opened}
      onClose={reject}
      title="Possível duplicidade"
      data-testid={ImportTestIds.DrawerDuplicates}
    >
      <Stack gap="md">
        <Stack gap={4}>
          <Text fz="xs" c="dimmed" tt="uppercase" fw={600}>
            Transação sendo importada
          </Text>
          <Card withBorder padding="sm">
            <Group justify="space-between" wrap="nowrap">
              <Stack gap={2}>
                <Text fw={500} fz="sm">
                  {row.description || '—'}
                </Text>
                <Text fz="xs" c="dimmed">
                  {formatDate(row.date)}
                </Text>
              </Stack>
              <Text fw={600} fz="sm">
                {formatBalance(row.amount)}
              </Text>
            </Group>
          </Card>
        </Stack>

        <Stack gap={4}>
          <Group gap={6}>
            <IconAlertTriangle size={16} color="var(--mantine-color-orange-6)" />
            <Text fz="xs" c="dimmed" tt="uppercase" fw={600}>
              {matches.length === 1
                ? '1 transação possivelmente duplicada'
                : `${matches.length} transações possivelmente duplicadas`}
            </Text>
          </Group>
          {matches.map((tx) => (
            <Card key={tx.id} withBorder padding="sm">
              <Group justify="space-between" wrap="nowrap">
                <Stack gap={2}>
                  <Text fw={500} fz="sm">
                    {tx.description}
                  </Text>
                  <Group gap={6}>
                    <Text fz="xs" c="dimmed">
                      {formatDate(tx.date)}
                    </Text>
                    <Badge size="xs" variant="light">
                      {accountName(tx.account_id)}
                    </Badge>
                  </Group>
                </Stack>
                <Text fw={600} fz="sm">
                  {formatBalance(tx.amount)}
                </Text>
              </Group>
            </Card>
          ))}
        </Stack>

        <Button
          color="red"
          variant="light"
          onClick={() => close('skip')}
          data-testid={ImportTestIds.DrawerDuplicatesSkipBtn}
        >
          Marcar como não importar
        </Button>
      </Stack>
    </ResponsiveDrawer>
  )
}
