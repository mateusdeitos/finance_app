import { formatBalance } from '@/utils/formatCents'
import { Notifications } from '@/types/notifications'

export type AmountState = 'known' | 'loading' | 'missing'

export interface NotificationContext {
  amount: number | null
  amountState: AmountState
  partnerName: string | null
  description?: string | null
}

const FALLBACK_PARTNER = 'Seu parceiro(a)'
const DASH = '—'

/**
 * Pure function: builds the pt-BR in-app description string for a notification.
 * No React, no hooks, no fetch — trivially unit-testable.
 *
 * Amount-inclusive templates mirror Phase 23 D-07 push copy for cross-channel
 * consistency. The `amountState` controls which copy variant is used:
 *   'known'   → full template with formatted BRL amount
 *   'loading' → degrade to the no-amount variant
 *   'missing' → substitute "—" in the amount slot (entity 404 / soft-deleted)
 *
 * The output is plain text — safe for rendering inside Mantine <Text> components
 * (no HTML injection path; T-25-06 mitigation).
 */
export function describeNotification(
  n: Notifications.Notification,
  ctx: NotificationContext,
): string {
  const who = ctx.partnerName ?? FALLBACK_PARTNER
  const { amountState } = ctx
  const amt = amountState === 'known' && ctx.amount != null ? formatBalance(ctx.amount) : DASH

  switch (n.type) {
    case 'charge_received':
      if (amountState === 'loading') return `${who} criou uma cobrança para você`
      if (amountState === 'missing') return `${who} te cobrou ${DASH}`
      return ctx.description
        ? `${who} te cobrou ${amt}: ${ctx.description}`
        : `${who} te cobrou ${amt}`

    case 'charge_accepted':
      if (amountState === 'loading') return `${who} aceitou sua cobrança`
      return `${who} aceitou sua cobrança de ${amountState === 'missing' ? DASH : amt}`

    case 'split_created':
      if (amountState === 'loading') return `${who} adicionou uma transação dividida`
      return `${who} adicionou uma transação dividida de ${amountState === 'missing' ? DASH : amt}`

    case 'split_updated':
      if (amountState === 'loading') return `${who} atualizou uma transação dividida`
      return `${who} atualizou uma transação dividida (${amountState === 'missing' ? DASH : amt})`

    default:
      return 'Nova notificação'
  }
}
