import { Button, Checkbox, Divider, Indicator, Popover, Stack, Text } from '@mantine/core'
import { IconBuildingBank } from '@tabler/icons-react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { useAccounts } from '@/hooks/useAccounts'
import { Transactions } from '@/types/transactions'

interface AccountFilterProps {
  inline?: boolean
}

function AccountOptions({ accounts, selected, toggle }: {
  accounts: Transactions.Account[]
  selected: number[]
  toggle: (id: number) => void
}) {
  const ownAccounts = accounts.filter((a) => !a.user_connection)
  const sharedAccounts = accounts.filter((a) => !!a.user_connection)

  if (accounts.length === 0) {
    return <Text size="sm" c="dimmed">Nenhuma conta</Text>
  }

  return (
    <>
      {ownAccounts.length > 0 && (
        <>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">Minhas contas</Text>
          {ownAccounts.map((acc) => (
            <Checkbox
              key={acc.id}
              label={acc.name}
              checked={selected.includes(acc.id)}
              onChange={() => toggle(acc.id)}
            />
          ))}
        </>
      )}
      {sharedAccounts.length > 0 && (
        <>
          {ownAccounts.length > 0 && <Divider />}
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">Contas compartilhadas</Text>
          {sharedAccounts.map((acc) => (
            <Checkbox
              key={acc.id}
              label={acc.name}
              checked={selected.includes(acc.id)}
              onChange={() => toggle(acc.id)}
            />
          ))}
        </>
      )}
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
          >
            Contas
          </Button>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs" maw={280}>
          <AccountOptions accounts={accounts} selected={selected} toggle={toggle} />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
