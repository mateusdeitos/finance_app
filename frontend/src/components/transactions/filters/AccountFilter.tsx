import { Button, Checkbox, Divider, Indicator, Popover, Stack, Text } from '@mantine/core'
import { IconBuildingBank } from '@tabler/icons-react'
import { useTransactionsSearch } from '@/hooks/useTransactionsSearch'
import { useState } from 'react'
import { useAccounts } from '@/hooks/useAccounts'
import { AccountAvatar } from '@/components/AccountAvatar'
import { Transactions } from '@/types/transactions'
import { TransactionsTestIds } from '@/testIds'
import classes from './AccountFilter.module.css'

interface AccountFilterProps {
  inline?: boolean
}

function AccountRow({
  account,
  checked,
  onToggle,
}: {
  account: Transactions.Account
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label
      className={`${classes.row}${checked ? ` ${classes.rowSelected}` : ''}`}
      data-account-name={account.name}
    >
      <AccountAvatar account={account} size={28} />
      <span className={classes.label}>
        <span className={classes.name}>{account.name}</span>
      </span>
      <Checkbox
        checked={checked}
        onChange={onToggle}
        size="sm"
        tabIndex={-1}
        data-testid={TransactionsTestIds.CheckboxFilterAccount(account.id)}
        aria-label={account.name}
      />
    </label>
  )
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
  const selectedInGroup = accounts.filter((a) => selected.includes(a.id)).length
  return (
    <Stack gap={2}>
      <div className={classes.groupHeader}>
        <span className={classes.groupTitle}>{label}</span>
        <span className={classes.groupCount}>
          {selectedInGroup}/{accounts.length}
        </span>
      </div>
      {accounts.map((acc) => (
        <AccountRow
          key={acc.id}
          account={acc}
          checked={selected.includes(acc.id)}
          onToggle={() => toggle(acc.id)}
        />
      ))}
    </Stack>
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
    <Stack gap="xs">
      <AccountGroup label="Minhas contas" accounts={activeOwn} selected={selected} toggle={toggle} />
      {activeOwn.length > 0 && activeShared.length > 0 && <Divider />}
      <AccountGroup label="Contas compartilhadas" accounts={activeShared} selected={selected} toggle={toggle} />

      {hasActive && hasInactive && <Divider />}

      <AccountGroup label="Inativas" accounts={[...inactiveOwn, ...inactiveShared]} selected={selected} toggle={toggle} />
    </Stack>
  )
}

export function AccountFilter({ inline }: AccountFilterProps) {
  const { query: accountsQuery } = useAccounts()
  const accounts = accountsQuery.data ?? []
  const { search, update } = useTransactionsSearch()
  const [opened, setOpened] = useState(false)

  const selected: number[] = search.accountIds ?? []

  function toggle(id: number) {
    const next = selected.includes(id)
      ? selected.filter((a) => a !== id)
      : [...selected, id]
    update((prev) => ({ ...prev, accountIds: next }))
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
            data-testid={TransactionsTestIds.BtnFilter('accounts')}
          >
            Contas
          </Button>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown data-testid={TransactionsTestIds.PopoverFilter('accounts')}>
        <Stack gap="xs" maw={280}>
          <AccountOptions accounts={accounts} selected={selected} toggle={toggle} />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
