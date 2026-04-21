import { Button, Checkbox, Divider, Indicator, Popover, Stack, Text } from '@mantine/core'
import { IconBuildingBank } from '@tabler/icons-react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { useAccounts } from '@/hooks/useAccounts'
import { Transactions } from '@/types/transactions'

interface AccountFilterProps {
  inline?: boolean
}

function AccountGroup({
  label,
  accounts,
  selected,
  toggle,
}: {
  label: string
  accounts: Transactions.Account[]
  selected: number[]
  toggle: (id: number) => void
}) {
  if (accounts.length === 0) return null
  return (
    <>
      <Text size="xs" fw={600} c="dimmed" tt="uppercase">{label}</Text>
      {accounts.map((acc) => (
        <Checkbox
          key={acc.id}
          label={acc.name}
          checked={selected.includes(acc.id)}
          onChange={() => toggle(acc.id)}
          data-testid={`checkbox_filter_account_${acc.id}`}
          data-account-name={acc.name}
        />
      ))}
    </>
  )
}

function AccountOptions({ accounts, selected, toggle }: {
  accounts: Transactions.Account[]
  selected: number[]
  toggle: (id: number) => void
}) {
  const activeOwn      = accounts.filter((a) => a.is_active && !a.user_connection)
  const activeShared   = accounts.filter((a) => a.is_active && !!a.user_connection)
  const inactiveOwn    = accounts.filter((a) => !a.is_active && !a.user_connection)
  const inactiveShared = accounts.filter((a) => !a.is_active && !!a.user_connection)

  const hasActive   = activeOwn.length > 0 || activeShared.length > 0
  const hasInactive = inactiveOwn.length > 0 || inactiveShared.length > 0

  if (accounts.length === 0) {
    return <Text size="sm" c="dimmed">Nenhuma conta</Text>
  }

  return (
    <>
      <AccountGroup label="Minhas contas" accounts={activeOwn} selected={selected} toggle={toggle} />
      {activeOwn.length > 0 && activeShared.length > 0 && <Divider />}
      <AccountGroup label="Contas compartilhadas" accounts={activeShared} selected={selected} toggle={toggle} />

      {hasActive && hasInactive && <Divider />}

      <AccountGroup label="Inativas" accounts={[...inactiveOwn, ...inactiveShared]} selected={selected} toggle={toggle} />
    </>
  )
}

export function AccountFilter({ inline }: AccountFilterProps) {
  const { query: accountsQuery } = useAccounts()
  const accounts = accountsQuery.data ?? []
  const navigate = useNavigate({ from: '/transactions' })
  const search = useSearch({ from: '/_authenticated/transactions' })
  const [opened, setOpened] = useState(false)

  const selected: number[] = search.accountIds ?? []

  function toggle(id: number) {
    const next = selected.includes(id)
      ? selected.filter((a) => a !== id)
      : [...selected, id]
    navigate({ search: (prev) => ({ ...prev, accountIds: next.length ? next : undefined }) })
  }

  if (inline) {
    return (
      <Stack gap="xs">
        <Text size="sm" fw={500}>Contas</Text>
        <AccountOptions accounts={accounts} selected={selected} toggle={toggle} />
      </Stack>
    )
  }

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" shadow="md">
      <Popover.Target>
        <Indicator label={selected.length} size={16} disabled={!selected.length}>
          <Button
            variant="default"
            leftSection={<IconBuildingBank size={16} />}
            onClick={() => setOpened((o) => !o)}
            data-testid="btn_filter_accounts"
          >
            Contas
          </Button>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown data-testid="popover_filter_accounts">
        <Stack gap="xs" maw={280}>
          <AccountOptions accounts={accounts} selected={selected} toggle={toggle} />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
