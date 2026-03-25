import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { Group, Avatar, ActionIcon, Text, Alert, Stack, Divider, Box, NumberInput, Tooltip, Switch } from '@mantine/core'
import { CurrencyInput } from './CurrencyInput'
import { Controller, Control, useWatch } from 'react-hook-form'
import { Transactions } from '@/types/transactions'
import type { TransactionFormValues } from './TransactionForm'

interface Props {
  control: Control<TransactionFormValues>
  accounts: Transactions.Account[]
  currentUserId: number
  errors?: Record<string, string>
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function getInitials(text: string): string {
  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

interface SplitRowProps {
  account: Transactions.Account
  currentUserId: number
  totalAmount: number
  enabled: boolean
  onToggle: (enabled: boolean) => void
  amount: number
  onChange: (cents: number) => void
  error?: string
}

function SplitRow({ account, currentUserId, totalAmount, enabled, onToggle, amount, onChange, error }: SplitRowProps) {
  const conn = account.user_connection!
  const isFrom = conn.from_user_id === currentUserId
  const defaultPercentage = isFrom
    ? conn.from_default_split_percentage
    : conn.to_default_split_percentage

  const [mode, setMode] = useState<'percentage' | 'amount'>('percentage')
  const [percentage, setPercentage] = useState(defaultPercentage)

  const calculatedAmount = Math.round((totalAmount * percentage) / 100)

  const onChangeRef = useRef(onChange)
  useLayoutEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    if (enabled && mode === 'percentage') {
      onChangeRef.current(calculatedAmount)
    }
  }, [calculatedAmount, mode, enabled])

  function toggleMode() {
    const next = mode === 'percentage' ? 'amount' : 'percentage'
    if (next === 'amount') onChange(calculatedAmount)
    setMode(next)
  }

  const label = account.description || account.name
  const initials = getInitials(label)
  const tooltipLabel = account.description ?? account.name

  return (
    <Stack gap={4}>
      <Group gap="sm" align="center" wrap="nowrap">
        <Tooltip label={tooltipLabel} withArrow>
          <Avatar size="sm" radius="xl" color="blue" style={{ cursor: 'default' }}>
            {initials}
          </Avatar>
        </Tooltip>

        <Switch checked={enabled} onChange={(e) => onToggle(e.currentTarget.checked)} />

        {enabled && (
          <>
            <ActionIcon
              size="md"
              radius="xl"
              variant="light"
              onClick={toggleMode}
              title={mode === 'percentage' ? 'Mudar para valor fixo' : 'Mudar para percentual'}
              style={{ flexShrink: 0, fontWeight: 700, fontSize: '0.7rem' }}
            >
              {mode === 'percentage' ? '%' : 'R$'}
            </ActionIcon>

            {mode === 'percentage' ? (
              <Group gap="xs" align="center" style={{ flex: 1 }}>
                <NumberInput
                  min={1}
                  max={100}
                  suffix="%"
                  value={percentage}
                  onChange={(val) => setPercentage(Number(val))}
                  style={{ width: 90 }}
                  size="sm"
                />
                {totalAmount > 0 && (
                  <Text size="sm" c="dimmed">
                    = R$ {formatCurrency(calculatedAmount)}
                  </Text>
                )}
              </Group>
            ) : (
              <Box style={{ flex: 1 }}>
                <CurrencyInput value={amount} onChange={onChange} error={error} />
              </Box>
            )}
          </>
        )}
      </Group>

      {error && enabled && mode === 'percentage' && (
        <Text size="xs" c="red">{error}</Text>
      )}
    </Stack>
  )
}

export function SplitSettingsFields({ control, accounts, currentUserId, errors }: Props) {
  const totalAmount = useWatch({ control, name: 'amount' }) ?? 0

  const connectedAccounts = accounts.filter(
    (a) => a.user_connection && a.user_connection.connection_status === 'accepted',
  )

  const [enabledMap, setEnabledMap] = useState<Record<number, boolean>>({})

  if (connectedAccounts.length === 0) return null

  const generalError = errors?.['split_settings']

  return (
    <Stack gap="xs">
      <Text fw={500} size="sm">Divisão</Text>

      {generalError && (
        <Alert color="red" variant="light" p="xs">
          {generalError}
        </Alert>
      )}

      <Divider />

      <Controller
        control={control}
        name="split_settings"
        render={({ field }) => (
          <Stack gap="sm">
            {connectedAccounts.map((account) => {
              const conn = account.user_connection!
              const connectionId = conn.id
              const enabled = enabledMap[connectionId] ?? false

              const entry = (field.value ?? []).find((s) => s.connection_id === connectionId)
              const currentAmount = entry?.amount ?? 0

              const entryIndex = (field.value ?? []).findIndex((s) => s.connection_id === connectionId)
              const indexErrors = entryIndex >= 0
                ? Object.fromEntries(
                    Object.entries(errors ?? {})
                      .filter(([k]) => k.startsWith(`split_settings.${entryIndex}.`))
                      .map(([k, v]) => [k.replace(`split_settings.${entryIndex}.`, ''), v]),
                  )
                : {}

              function handleToggle(on: boolean) {
                setEnabledMap((prev) => ({ ...prev, [connectionId]: on }))
                if (!on) {
                  field.onChange((field.value ?? []).filter((s) => s.connection_id !== connectionId))
                }
              }

              function handleChange(cents: number) {
                const next = (field.value ?? []).filter((s) => s.connection_id !== connectionId)
                next.push({ connection_id: connectionId, amount: cents })
                field.onChange(next)
              }

              return (
                <SplitRow
                  key={connectionId}
                  account={account}
                  currentUserId={currentUserId}
                  totalAmount={totalAmount}
                  enabled={enabled}
                  onToggle={handleToggle}
                  amount={currentAmount}
                  onChange={handleChange}
                  error={indexErrors['amount'] ?? errors?.[`split_settings.${entryIndex}`]}
                />
              )
            })}
          </Stack>
        )}
      />
    </Stack>
  )
}
