import { ActionIcon, Button, Card, Group, Stack, Text } from '@mantine/core'
import { IconTrash } from '@tabler/icons-react'
import { Charges } from '@/types/charges'
import { formatBalance } from '@/utils/formatCents'
import { ChargeStatusBadge } from './ChargeStatusBadge'
import classes from './ChargeCard.module.css'
import { ChargesTestIds } from '@/testIds'

interface Props {
  charge: Charges.Charge
  currentUserId: number
  partnerName: string
  balanceAmount?: number
  onAccept?: () => void
  onReject?: () => void
  onCancel?: () => void
  onDelete?: () => void
}

export function ChargeCard({ charge, currentUserId, partnerName, balanceAmount, onAccept, onReject, onCancel, onDelete }: Props) {
  // "Received" means the charge is awaiting MY action: I'm a party but I did
  // not initiate it. The initiator (whatever their charger/payer role) is the
  // one who can cancel; the counterparty is the one who accepts/rejects.
  const isReceived = charge.initiator_user_id !== currentUserId
  const isPending = charge.status === 'pending'
  // Paid charges own settlement transfers and cannot be deleted.
  const isDeletable = charge.status !== 'paid'

  const period =
    String(charge.period_month).padStart(2, '0') + '/' + charge.period_year

  return (
    <Card
      withBorder
      radius="md"
      p="md"
      className={classes.card}
      data-testid={ChargesTestIds.Card(charge.id)}
    >
      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Text size="md" fw={400}>
            {partnerName}
          </Text>
          <Text size="sm" c="dimmed">
            {period}
          </Text>
          {charge.description && (
            <Text size="sm" c="dimmed" lineClamp={1}>
              {charge.description}
            </Text>
          )}
        </Stack>
        <ChargeStatusBadge status={charge.status} />
      </Group>

      <Group justify="space-between" align="center" mt="sm">
        <Text size="md" fw={700}>
          {balanceAmount != null ? formatBalance(balanceAmount) : '---'}
        </Text>
        <Group gap="xs">
          {isReceived && isPending && onAccept && (
            <Button size="xs" color="teal" onClick={onAccept} data-testid={ChargesTestIds.BtnAccept}>
              Aceitar
            </Button>
          )}
          {isReceived && isPending && onReject && (
            <Button size="xs" color="red" variant="light" onClick={onReject} data-testid={ChargesTestIds.BtnReject}>
              Recusar
            </Button>
          )}
          {!isReceived && isPending && onCancel && (
            <Button size="xs" color="red" variant="light" onClick={onCancel} data-testid={ChargesTestIds.BtnCancel}>
              Cancelar
            </Button>
          )}
          {isDeletable && onDelete && (
            <ActionIcon
              size="lg"
              color="red"
              variant="subtle"
              onClick={onDelete}
              aria-label="Excluir cobrança"
              data-testid={ChargesTestIds.BtnDelete}
            >
              <IconTrash size={16} />
            </ActionIcon>
          )}
        </Group>
      </Group>
    </Card>
  )
}
