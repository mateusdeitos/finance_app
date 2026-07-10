import { Stack, Text } from '@mantine/core'
import { AccountCard } from '@/components/accounts/AccountCard'
import { Transactions } from '@/types/transactions'

type Props = {
  label: string
  accounts: Transactions.Account[]
  testId?: string
  onEdit?: (a: Transactions.Account) => void
  onDeactivate?: (a: Transactions.Account) => void
  onActivate?: (a: Transactions.Account) => void
  onDelete?: (a: Transactions.Account) => void
  /** When provided, the section renders reorder arrows and reports the new order. */
  onReorder?: (orderedIds: number[]) => void
}

export function AccountSection({
  label,
  accounts,
  testId,
  onEdit,
  onDeactivate,
  onActivate,
  onDelete,
  onReorder,
}: Props) {
  if (accounts.length === 0) return null

  function move(index: number, delta: number) {
    if (!onReorder) return
    const reordered = [...accounts]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(index + delta, 0, moved)
    onReorder(reordered.map((a) => a.id))
  }

  return (
    <Stack gap="sm" data-testid={testId}>
      <Text size="sm" fw={600} c="dimmed" tt="uppercase">{label}</Text>
      {accounts.map((account, index) => (
        <AccountCard
          key={account.id}
          account={account}
          onEdit={onEdit}
          onDeactivate={onDeactivate}
          onActivate={onActivate}
          onDelete={onDelete}
          onMoveUp={onReorder ? () => move(index, -1) : undefined}
          onMoveDown={onReorder ? () => move(index, 1) : undefined}
          canMoveUp={index > 0}
          canMoveDown={index < accounts.length - 1}
        />
      ))}
    </Stack>
  )
}
