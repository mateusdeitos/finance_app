import { ActionIcon, Box, Group, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core'
import {
  IconCheck,
  IconChevronRight,
  IconCircleCheck,
  IconCreditCard,
  IconRefresh,
  IconTransferIn,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react'
import type { MouseEvent } from 'react'
import { router } from '@/router'
import { Notifications } from '@/types/notifications'
import { deriveDeepLink } from '@/utils/pushDeepLink'
import { buildTransactionSearchFromNotification } from '@/utils/notificationNavigation'
import { describeNotification } from './describeNotification'
import { type ResolvedAmount } from '@/hooks/useResolveNotificationAmounts'
import { NotificationsTestIds } from '@/testIds'
import classes from './NotificationRow.module.css'

// ─── Per-type icon + ThemeIcon tint (UI-SPEC § "Icon per notification type") ──
const NOTIF_TYPE_CONFIG: Record<
  Notifications.NotificationType,
  { Icon: typeof IconCreditCard; color: string }
> = {
  charge_received: { Icon: IconCreditCard, color: 'blue' },
  charge_accepted: { Icon: IconCircleCheck, color: 'teal' },
  split_created: { Icon: IconUsers, color: 'violet' },
  split_updated: { Icon: IconRefresh, color: 'orange' },
  transfer_received: { Icon: IconTransferIn, color: 'green' },
  shared_transaction_deleted: { Icon: IconTrash, color: 'red' },
}

const FALLBACK_CONFIG = { Icon: IconCreditCard, color: 'gray' }

// ─── Relative timestamp helper ────────────────────────────────────────────────
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

function formatRelativeTime(createdAt: string): string {
  const date = new Date(createdAt)
  const now = Date.now()
  const diff = now - date.getTime() // positive → past

  if (Math.abs(diff) < WEEK) {
    // Within 7 days → relative format
    const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
    if (Math.abs(diff) < MINUTE) {
      return rtf.format(-Math.round(diff / SECOND), 'second')
    }
    if (Math.abs(diff) < HOUR) {
      return rtf.format(-Math.round(diff / MINUTE), 'minute')
    }
    if (Math.abs(diff) < DAY) {
      return rtf.format(-Math.round(diff / HOUR), 'hour')
    }
    return rtf.format(-Math.round(diff / DAY), 'day')
  }

  // > 7 days → short date
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date)
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface NotificationRowProps {
  notification: Notifications.Notification
  /** Resolved entity amount from useResolveNotificationAmounts */
  resolved: ResolvedAmount
  /** Partner name from useAccounts (null → "Seu parceiro(a)") */
  partnerName: string | null
  /** Called after tap fires mark-read + navigate, so mobile drawer can close */
  onAfterTap?: () => void
  /** Fires mark-read mutation (parent owns the hook + onSuccess invalidation) */
  markRead: (id: number) => void
  /** Hard-deletes this notification (parent owns the hook; no confirmation) */
  deleteNotification: (id: number) => void
}

export function NotificationRow({
  notification,
  resolved,
  partnerName,
  onAfterTap,
  markRead,
  deleteNotification,
}: NotificationRowProps) {
  const typeConfig =
    NOTIF_TYPE_CONFIG[notification.type as Notifications.NotificationType] ?? FALLBACK_CONFIG

  // The inbox API now persists the entity description on the notification row.
  // Prefer it; fall back to the resolved entity's description when absent (older
  // rows created before the column existed have no description).
  const description = notification.description ?? resolved.description

  // Prefer the amount persisted on the notification row. It's authoritative for
  // rows whose referenced entity can't be resolved to the right value — e.g. a
  // shared-transaction deletion, where the source is gone (entity_id 0) or holds
  // the full amount rather than the removed share. Fall back to entity resolution
  // for older rows / types that don't persist an amount.
  const hasPersistedAmount = notification.amount != null
  const amount = hasPersistedAmount ? (notification.amount as number) : resolved.amount
  const amountState = hasPersistedAmount ? 'known' : resolved.amountState

  const desc = describeNotification(notification, {
    amount,
    amountState,
    partnerName,
    description,
  })

  const timestamp = formatRelativeTime(notification.created_at)

  function handleTap() {
    // 1. Fire mark-read optimistically in the background (parent-owned hook)
    markRead(notification.id)

    // 2. Navigate to the related list page via the global router
    //    (drawer roots lack RouterProvider — must use router directly).
    //    For transaction entities, filter /transactions to the resolved
    //    transaction's month/year and use its description as the text query.
    if (notification.entity_type === 'transaction') {
      const search = buildTransactionSearchFromNotification(resolved.date, description)
      if (search != null) {
        void router.navigate({ to: '/transactions', search })
        onAfterTap?.()
        return
      }
    }

    const to = deriveDeepLink({
      type: notification.type,
      entity_type: notification.entity_type,
    })
    if (to !== '/') {
      void router.navigate({ to })
    }

    // 3. Let the mobile drawer close (if present)
    onAfterTap?.()
  }

  // Per-row action buttons must NOT trigger the row's tap-to-navigate.
  function handleMarkReadClick(e: MouseEvent) {
    e.stopPropagation()
    markRead(notification.id)
  }

  function handleDeleteClick(e: MouseEvent) {
    e.stopPropagation()
    deleteNotification(notification.id)
  }

  const isUnread = !notification.read

  return (
    <UnstyledButton
      onClick={handleTap}
      className={isUnread ? classes.unread : undefined}
      data-testid={NotificationsTestIds.Row(notification.id)}
      aria-label={`${desc}${isUnread ? ' — não lida' : ''}`}
      w="100%"
      style={{ minHeight: 48, boxSizing: 'border-box' }}
    >
      <Group align="center" wrap="nowrap" px="sm" py="xs" gap="sm" w="100%">
        {/* 8px unread dot or transparent spacer to keep alignment */}
        <Box
          w={8}
          h={8}
          bg={isUnread ? 'blue.6' : 'transparent'}
          style={{ borderRadius: '50%', flexShrink: 0 }}
          aria-hidden="true"
          data-testid={isUnread ? NotificationsTestIds.UnreadDot(notification.id) : undefined}
        />

        {/* Per-type ThemeIcon */}
        <ThemeIcon
          variant="light"
          radius="md"
          size={36}
          color={isUnread ? typeConfig.color : 'gray'}
        >
          <typeConfig.Icon size={20} stroke={1.5} />
        </ThemeIcon>

        {/* Description + timestamp */}
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text
            size="sm"
            fw={500}
            lineClamp={2}
            c={isUnread ? undefined : 'dimmed'}
          >
            {desc}
          </Text>
          <Text size="xs" c="dimmed">
            {timestamp}
          </Text>
        </Stack>

        {/* Per-row actions — stopPropagation so they don't navigate */}
        <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
          {isUnread && (
            <ActionIcon
              variant="subtle"
              color="gray"
              size="md"
              onClick={handleMarkReadClick}
              data-testid={NotificationsTestIds.RowBtnMarkRead(notification.id)}
              aria-label="Marcar como lida"
            >
              <IconCheck size={18} stroke={1.5} />
            </ActionIcon>
          )}
          <ActionIcon
            variant="subtle"
            color="red"
            size="md"
            onClick={handleDeleteClick}
            data-testid={NotificationsTestIds.RowBtnDelete(notification.id)}
            aria-label="Remover notificação"
          >
            <IconTrash size={18} stroke={1.5} />
          </ActionIcon>
        </Group>

        {/* Trailing chevron */}
        <IconChevronRight size={16} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
      </Group>
    </UnstyledButton>
  )
}
