import { useRef, useState } from 'react'
import { ActionIcon, Avatar, Box, Button, Checkbox, Group, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { CurrencyInput } from '@/components/transactions/form/CurrencyInput'
import { OnboardingTestIds } from '@/testIds'
import type { OnboardingAccount } from './onboardingDefaults'

interface Props {
  accounts: OnboardingAccount[]
  onToggle: (id: string) => void
  onUpdateBalance: (id: string, cents: number) => void
  onUpdateDescription: (id: string, description: string) => void
  onAddAccount: (name: string) => void
  onRemoveAccount: (id: string) => void
}

export function AccountsStep({ accounts, onToggle, onUpdateBalance, onUpdateDescription, onAddAccount, onRemoveAccount }: Props) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  function commitAdd() {
    const trimmed = newName.trim()
    if (trimmed) onAddAccount(trimmed)
    setNewName('')
    setAdding(false)
  }

  return (
    <Stack gap="md" data-testid={OnboardingTestIds.StepAccounts}>
      <Stack gap={4}>
        <Text fw={600} size="lg">Suas contas</Text>
        <Text c="dimmed" size="sm">
          Contas representam de onde o seu dinheiro entra ou sai: conta corrente, cartões de crédito,
          carteira digital ou uma reserva. Selecione as contas que você quer começar a usar e defina
          o saldo inicial de cada uma — você pode editar tudo depois.
        </Text>
      </Stack>

      <Stack gap="xs">
        {accounts.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            onToggle={() => onToggle(account.id)}
            onUpdateBalance={(cents) => onUpdateBalance(account.id, cents)}
            onUpdateDescription={(desc) => onUpdateDescription(account.id, desc)}
            onRemove={account.isCustom ? () => onRemoveAccount(account.id) : undefined}
          />
        ))}

        {adding ? (
          <Box
            style={{
              padding: '0.75rem',
              borderRadius: 8,
              border: '1px dashed var(--mantine-color-gray-4)',
            }}
          >
            <TextInput
              ref={nameRef}
              value={newName}
              onChange={(e) => setNewName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitAdd() }
                if (e.key === 'Escape') { setNewName(''); setAdding(false) }
              }}
              onBlur={commitAdd}
              placeholder="Nome da conta"
              data-testid={OnboardingTestIds.InputNewAccountName}
            />
          </Box>
        ) : (
          <Button
            variant="subtle"
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              setAdding(true)
              setTimeout(() => nameRef.current?.focus(), 0)
            }}
            data-testid={OnboardingTestIds.BtnAddAccount}
          >
            Adicionar conta
          </Button>
        )}
      </Stack>
    </Stack>
  )
}

interface AccountRowProps {
  account: OnboardingAccount
  onToggle: () => void
  onUpdateBalance: (cents: number) => void
  onUpdateDescription: (description: string) => void
  onRemove?: () => void
}

function AccountRow({ account, onToggle, onUpdateBalance, onUpdateDescription, onRemove }: AccountRowProps) {
  return (
    <Box
      style={{
        padding: '0.75rem',
        borderRadius: 8,
        border: '1px solid var(--mantine-color-gray-3)',
      }}
      data-testid={OnboardingTestIds.AccountRow(account.id)}
    >
      <Group
        gap="sm"
        wrap="nowrap"
        align="center"
        style={{ cursor: 'pointer' }}
        onClick={onToggle}
      >
        <Checkbox
          checked={account.selected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          data-testid={OnboardingTestIds.CheckboxAccount(account.id)}
        />
        <Avatar
          radius="xl"
          size="md"
          styles={{
            placeholder: { backgroundColor: account.avatar_background_color, color: 'white' },
          }}
        >
          {account.name.charAt(0)}
        </Avatar>
        <Text fw={500} style={{ flex: 1 }}>{account.name}</Text>
        {onRemove && (
          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            data-testid={OnboardingTestIds.BtnRemoveAccount(account.id)}
          >
            <IconTrash size={14} />
          </ActionIcon>
        )}
      </Group>
      {account.selected && (
        <Stack pt="xs" gap="xs" onClick={(e) => e.stopPropagation()}>
          <CurrencyInput
            value={account.initial_balance}
            onChange={onUpdateBalance}
            label="Saldo inicial"
            allowNegative
            data-testid={OnboardingTestIds.InputAccountBalance(account.id)}
          />
          <Textarea
            value={account.description}
            onChange={(e) => onUpdateDescription(e.currentTarget.value)}
            label="Descrição"
            placeholder="Ex: conta principal do Nubank"
            autosize
            minRows={1}
            maxRows={3}
            data-testid={OnboardingTestIds.InputAccountDescription(account.id)}
          />
        </Stack>
      )}
    </Box>
  )
}
