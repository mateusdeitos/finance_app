import { Button, Indicator, Popover, Stack, Switch, Text } from '@mantine/core'
import { IconAdjustments } from '@tabler/icons-react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { Transactions } from '@/types/transactions'

const TYPE_OPTIONS: { value: Transactions.TransactionType; label: string }[] = [
  { value: 'expense', label: 'Apenas despesas' },
  { value: 'income', label: 'Apenas receitas' },
  { value: 'transfer', label: 'Apenas transferências' },
]

interface AdvancedFilterProps {
  inline?: boolean
}

function TypeOptions({ selected, toggle }: {
  selected: Transactions.TransactionType[]
  toggle: (v: Transactions.TransactionType) => void
}) {
  return (
    <>
      {TYPE_OPTIONS.map((opt) => (
        <Switch
          key={opt.value}
          label={opt.label}
          checked={selected.includes(opt.value)}
          onChange={() => toggle(opt.value)}
        />
      ))}
    </>
  )
}

export function AdvancedFilter({ inline }: AdvancedFilterProps) {
  const navigate = useNavigate({ from: '/transactions' })
  const search = useSearch({ from: '/_authenticated/transactions' })
  const [opened, setOpened] = useState(false)

  const selected: Transactions.TransactionType[] = search.types ?? []

  function toggle(value: Transactions.TransactionType) {
    const next = selected.includes(value)
      ? selected.filter((t) => t !== value)
      : [...selected, value]
    navigate({ search: (prev) => ({ ...prev, types: next.length ? next : undefined }) })
  }

  if (inline) {
    return (
      <Stack gap="xs">
        <Text size="sm" fw={500}>Tipo</Text>
        <TypeOptions selected={selected} toggle={toggle} />
      </Stack>
    )
  }

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" shadow="md">
      <Popover.Target>
        <Indicator label={selected.length} size={16} disabled={!selected.length}>
          <Button
            variant="default"
            leftSection={<IconAdjustments size={16} />}
            onClick={() => setOpened((o) => !o)}
          >
            Filtros avançados
          </Button>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <TypeOptions selected={selected} toggle={toggle} />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
