import { Badge } from '@mantine/core'
import { Charges } from '@/types/charges'

const STATUS_COLORS: Record<Charges.ChargeStatus, string> = {
  pending: 'yellow',
  paid: 'teal',
  rejected: 'red',
  cancelled: 'gray',
}

const STATUS_LABELS: Record<Charges.ChargeStatus, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
}

interface Props {
  status: Charges.ChargeStatus
}

export function ChargeStatusBadge({ status }: Props) {
  return (
    <Badge color={STATUS_COLORS[status]} variant="light" size="sm">
      {STATUS_LABELS[status]}
    </Badge>
  )
}
