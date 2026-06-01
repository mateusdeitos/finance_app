import { Box, Group, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core'
import {
  IconChevronRight,
  IconCircleCheck,
  IconCreditCard,
  IconRefresh,
  IconTransferIn,
  IconUsers,
} from '@tabler/icons-react'
import { router } from '@/router'
import { Notifications } from '@/types/notifications'
import { deriveDeepLink } from '@/utils/pushDeepLink'
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
}

export function NotificationRow({
  notification,
  resolved,
  partnerName,
  onAfterTap,
  markRead,
}: NotificationRowProps) {
  const typeConfig =
    NOTIF_TYPE_CONFIG[notification.type as Notifications.NotificationType] ?? FALLBACK_CONFIG

  const desc = describeNotification(notification, {
    amount: resolved.amount,
    amountState: resolved.amountState,
    partnerName,
    // description is not in the Notification type — charge_received copy with description
    // is handled inside describeNotification when ctx.description is provided. Since the
    // inbox API doesn't return a description field, we omit it here (produces the short
    // "{who} te cobrou {amount}" variant, which is correct per UI-SPEC).
    description: null,
  })

  const timestamp = formatRelativeTime(notification.created_at)

  function handleTap() {
    // 1. Fire mark-read optimistically in the background (parent-owned hook)
    markRead(notification.id)

    // 2. Navigate to the related list page via the global router
    //    (drawer roots lack RouterProvider — must use router directly)
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

        {/* Trailing chevron */}
        <IconChevronRight size={16} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
      </Group>
    </UnstyledButton>
  )
}
