import { Group, Loader, Stack, Switch, Text } from '@mantine/core'
import { IconBell, IconBellOff } from '@tabler/icons-react'
import { usePushSubscription } from '@/hooks/usePushSubscription'
import { NotificationsTestIds } from '@/testIds'
import classes from './NotificationToggleRow.module.css'

interface NotificationToggleRowProps {
  /** Variant determines which helper copy length to use (mobile=short, desktop=full). */
  variant: 'mobile' | 'desktop'
}

const helperId = 'notification-helper-text'

/**
 * 5-state notification toggle row.
 *
 * States: default | requesting | enabled | denied | unsupported
 * Consumed by MobileMoreDrawer (variant="mobile") and DesktopSidebar (variant="desktop").
 *
 * Rules:
 * - Switch checked only when state === 'enabled'
 * - Switch disabled when state ∈ {requesting, denied, unsupported}
 * - requesting → replace icon with <Loader size="xs" color="blue" /> (OD-1 LOCKED)
 * - denied → icon + helper c="red"
 * - unsupported / default / requesting → helper c="dimmed"
 * - onChange calls onToggle() — no inline effects (CLAUDE.md §4)
 */
export function NotificationToggleRow({ variant }: NotificationToggleRowProps) {
  const { state, onToggle, helperText } = usePushSubscription()

  const isChecked = state === 'enabled'
  const isDisabled = state === 'requesting' || state === 'denied' || state === 'unsupported'

  const helperColor = state === 'denied' ? 'red' : 'dimmed'
  const iconColor = state === 'denied' ? 'red' : state === 'enabled' ? undefined : 'dimmed'

  // Left column: Loader during requesting (OD-1 LOCKED), Bell when enabled, BellOff otherwise
  const leftIcon = (() => {
    if (state === 'requesting') {
      return <Loader size="xs" color="blue" />
    }
    if (state === 'enabled') {
      return <IconBell size={20} stroke={1.8} color={iconColor ? `var(--mantine-color-${iconColor}-6)` : undefined} />
    }
    return (
      <IconBellOff
        size={20}
        stroke={1.8}
        color={
          iconColor === 'red'
            ? 'var(--mantine-color-red-6)'
            : 'var(--mantine-color-dimmed)'
        }
      />
    )
  })()

  return (
    <Group
      justify="space-between"
      align="center"
      wrap="nowrap"
      gap="md"
      className={classes.row}
      data-testid={NotificationsTestIds.RowNotifications}
    >
      {/* Left: icon column (fixed 20px width) */}
      <div className={classes.iconCol}>{leftIcon}</div>

      {/* Centre: label + helper */}
      <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm" fw={500}>
          Notificações
        </Text>
        <Text
          size="xs"
          c={helperColor}
          id={helperId}
          data-testid={NotificationsTestIds.HelperNotifications}
        >
          {helperText(variant)}
        </Text>
      </Stack>

      {/* Right: Switch */}
      <Switch
        size="md"
        checked={isChecked}
        disabled={isDisabled}
        onChange={() => onToggle()}
        color="blue"
        aria-label={isChecked ? 'Desativar notificações' : 'Ativar notificações'}
        aria-describedby={helperId}
        data-testid={NotificationsTestIds.SwitchNotifications}
      />
    </Group>
  )
}
