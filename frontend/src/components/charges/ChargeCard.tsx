import { Button, Card, Group, Stack, Text } from '@mantine/core'
import { Charges } from '@/types/charges'
import { formatBalance } from '@/utils/formatCents'
import { ChargeStatusBadge } from './ChargeStatusBadge'
import classes from './ChargeCard.module.css'

interface Props {
  charge: Charges.Charge
  currentUserId: number
  partnerName: string
  balanceAmount?: number
  onAccept?: () => void
  onReject?: () => void
  onCancel?: () => void
}

export function ChargeCard({ charge, currentUserId, partnerName, balanceAmount, onAccept, onReject, onCancel }: Props) {
  const isReceived = charge.payer_user_id === currentUserId
  const isPending = charge.status === 'pending'

  const period =
    String(charge.period_month).padStart(2, '0') + '/' + charge.period_year

  return (
    <Card withBorder radius="md" p="md" className={classes.card}>
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
            <Button size="xs" color="teal" onClick={onAccept}>
              Aceitar
            </Button>
          )}
          {isReceived && isPending && onReject && (
            <Button size="xs" color="red" variant="light" onClick={onReject}>
              Recusar
            </Button>
          )}
          {!isReceived && isPending && onCancel && (
            <Button size="xs" color="red" variant="light" onClick={onCancel}>
              Cancelar
            </Button>
          )}
        </Group>
      </Group>
    </Card>
  )
}
