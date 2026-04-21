import { Stack, Text } from '@mantine/core'
import { AccountCard } from '@/components/accounts/AccountCard'
import { Transactions } from '@/types/transactions'

type Props = {
  label: string
  accounts: Transactions.Account[]
  onEdit: (a: Transactions.Account) => void
  onAction: (a: Transactions.Account) => void
  testId?: string
}

export function AccountSection({ label, accounts, onEdit, onAction, testId }: Props) {
  if (accounts.length === 0) return null
  return (
    <Stack gap="sm" data-testid={testId}>
      <Text size="sm" fw={600} c="dimmed" tt="uppercase">{label}</Text>
      {accounts.map((account) => (
        <AccountCard
          key={account.id}
          account={account}
          onEdit={onEdit}
          onDelete={onAction}
        />
      ))}
    </Stack>
  )
}
