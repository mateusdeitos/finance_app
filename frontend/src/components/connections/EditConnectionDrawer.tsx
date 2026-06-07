import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Divider,
  Group,
  NumberInput,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { useMe } from '@/hooks/useMe'
import { useAccounts } from '@/hooks/useAccounts'
import { useUserConnections } from '@/hooks/useUserConnections'
import { useUpdateConnection } from '@/hooks/useUpdateConnection'
import { useDrawerContext } from '@/utils/renderDrawer'
import { ResponsiveDrawer } from '@/components/ResponsiveDrawer'
import { UserAvatar } from '@/components/UserAvatar'
import { SplitSelector } from '@/components/connections/SplitSelector'
import { SplitFlowDiagram } from '@/components/connections/SplitFlowDiagram'
import { Transactions } from '@/types/transactions'
import { CommonTestIds } from '@/testIds'

const PRESETS = [50, 60, 70, 80]

const schema = z.object({
  account_name: z.string().trim().min(1, 'Nome é obrigatório'),
})

type EditConnectionFormValues = z.infer<typeof schema>

interface Props {
  /** The caller's own shared account (the one carrying `user_connection`). */
  account: Transactions.Account
}

export function EditConnectionDrawer({ account }: Props) {
  const { opened, close, reject } = useDrawerContext<void>()
  const { query: meQuery } = useMe()
  const user = meQuery.data
  const { invalidate: invalidateAccounts } = useAccounts()
  const { invalidate: invalidateConnections } = useUserConnections()

  const connection = account.user_connection
  const isFrom = connection?.from_user_id === user?.id
  const currentSplit = connection
    ? isFrom
      ? connection.from_default_split_percentage
      : connection.to_default_split_percentage
    : 50
  const partnerAvatarUrl = isFrom
    ? connection?.to_user_avatar_url
    : connection?.from_user_avatar_url

  // The day-of-month preference is stored per side; show the caller's own side.
  const currentDay =
    (isFrom
      ? connection?.from_linked_transaction_day_of_month
      : connection?.to_linked_transaction_day_of_month) ?? null

  const [splitMode, setSplitMode] = useState<number | 'custom'>(
    PRESETS.includes(currentSplit) ? currentSplit : 'custom',
  )
  const [customValue, setCustomValue] = useState(
    PRESETS.includes(currentSplit) ? 65 : currentSplit,
  )
  const [dayOfMonth, setDayOfMonth] = useState<number | ''>(currentDay ?? '')
  const effectiveSplit = splitMode === 'custom' ? customValue : splitMode

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<EditConnectionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { account_name: account.name },
  })

  const nameValue = useWatch({ control, name: 'account_name' }) ?? account.name
  const partnerName = nameValue.trim() || account.name
  const userName = user?.name?.split(' ')[0] ?? 'Você'

  const { mutation } = useUpdateConnection({
    onSuccess: async () => {
      await Promise.all([invalidateAccounts(), invalidateConnections()])
      close()
    },
  })

  const dirty =
    nameValue.trim() !== account.name ||
    effectiveSplit !== currentSplit ||
    (dayOfMonth === '' ? null : dayOfMonth) !== currentDay

  function onSubmit(values: EditConnectionFormValues) {
    if (!connection) return
    mutation.mutate({
      id: connection.id,
      payload: {
        account_name: values.account_name.trim(),
        default_split_percentage: effectiveSplit,
        linked_transaction_day_of_month: dayOfMonth === '' ? null : dayOfMonth,
      },
    })
  }

  const submit = handleSubmit(onSubmit)

  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <ResponsiveDrawer
      opened={opened}
      onClose={reject}
      title="Editar conexão"
      data-testid={CommonTestIds.DrawerEditConnection}
      styles={{ body: { padding: 0 } }}
    >
      <form
        onSubmit={submit}
        onKeyDown={handleFormKeyDown}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}
      >
        {/* Identity banner — solid surface so it reads as its own section
            directly under the drawer title, no gradient bleed. */}
        <Group
          gap="sm"
          wrap="nowrap"
          px="md"
          py="sm"
          style={{
            background: 'var(--mantine-color-default-hover)',
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
        >
          <Box style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <UserAvatar name={userName} avatarUrl={user?.avatar_url} size="md" color="blue" />
            <ThemeIcon
              size={20}
              radius="xl"
              variant="filled"
              color="teal"
              style={{
                marginInline: -7,
                border: '2px solid var(--mantine-color-body)',
                zIndex: 1,
              }}
            >
              <IconCheck size={11} />
            </ThemeIcon>
            <Avatar size="md" radius="xl" color="grape" variant="filled" src={partnerAvatarUrl}>
              {partnerName.charAt(0).toUpperCase()}
            </Avatar>
          </Box>
          <Box style={{ minWidth: 0 }}>
            <Text fw={700} size="sm" truncate>
              Conectado com {partnerName}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              Alterações valem para as próximas transações
            </Text>
          </Box>
        </Group>

        {/* Scrollable content — grows to fill, with bottom padding so the last
            row never hides under the sticky footer. */}
        <Stack gap="lg" p="md" pb={96} style={{ flex: 1 }}>
          {mutation.error && (
            <Alert color="red" title="Erro" variant="light">
              {mutation.error.message}
            </Alert>
          )}

          <Box>
            <TextInput
              label="Nome da conta da conexão"
              required
              {...register('account_name')}
              error={errors.account_name?.message}
              placeholder="Ex.: Amanda, conta do casal…"
              maxLength={40}
              data-testid={CommonTestIds.EditConnectionNameInput}
            />
            <Text size="xs" c="dimmed" mt={6}>
              É assim que essa conta aparece nas suas transações e listas. Só muda
              no seu app — não afeta o que {partnerName} vê.
            </Text>
          </Box>

          <Divider />

          <SplitSelector
            value={splitMode}
            customValue={customValue}
            userName={userName}
            userAvatarUrl={user?.avatar_url}
            partnerName={partnerName}
            partnerHasName
            onChange={setSplitMode}
            onCustomChange={setCustomValue}
          />

          <SplitFlowDiagram
            split={effectiveSplit}
            userName={userName}
            userAvatarUrl={user?.avatar_url}
            partnerName={partnerName}
            partnerHasName
          />

          <Divider />

          <Box>
            <NumberInput
              label="Dia do mês para suas transações"
              placeholder="Manter a data original"
              min={1}
              max={31}
              clampBehavior="strict"
              allowDecimal={false}
              allowNegative={false}
              value={dayOfMonth}
              onChange={(value) =>
                setDayOfMonth(typeof value === 'number' ? value : '')
              }
              data-testid={CommonTestIds.EditConnectionDayInput}
            />
            <Text size="xs" c="dimmed" mt={6}>
              Quando {partnerName} dividir uma despesa com você, sua parte será
              criada nesse dia do mês. Deixe em branco para usar a data original
              da transação.
            </Text>
          </Box>
        </Stack>

        {/* Sticky footer — solid background, top border, safe-area aware. */}
        <Group
          justify="space-between"
          px="md"
          pt="md"
          style={{
            borderTop: '1px solid var(--mantine-color-default-border)',
            background: 'var(--mantine-color-body)',
            position: 'sticky',
            bottom: 0,
            paddingBottom: 'calc(var(--mantine-spacing-md) + env(safe-area-inset-bottom))',
          }}
        >
          <Button
            variant="default"
            onClick={() => reject()}
            data-testid={CommonTestIds.EditConnectionCancel}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            loading={mutation.isPending}
            disabled={!dirty}
            leftSection={<IconCheck size={16} />}
            data-testid={CommonTestIds.EditConnectionSave}
          >
            Salvar alterações
          </Button>
        </Group>
      </form>
    </ResponsiveDrawer>
  )
}
