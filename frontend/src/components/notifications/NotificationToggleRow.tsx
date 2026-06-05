import { Button, Group, Loader, Stack, Switch, Text } from '@mantine/core'
import { IconBell, IconBellOff, IconSend } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { usePushSubscription } from '@/hooks/usePushSubscription'
import { useSendTestNotification } from '@/hooks/useSendTestNotification'
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
  const { mutation: testMutation } = useSendTestNotification({
    onSuccess: () =>
      notifications.show({
        color: 'teal',
        title: 'Notificação de teste enviada',
        message: 'Veja como ela aparece no seu dispositivo.',
        autoClose: 3000,
      }),
    onError: (error: Error) =>
      notifications.show({
        color: 'red',
        title: 'Erro ao enviar',
        message: error.message || 'Não foi possível enviar a notificação de teste. Tente novamente.',
        autoClose: 5000,
      }),
  })

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
    <Stack gap="xs">
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

      {/* Test-notification trigger — only when push is enabled on this device.
          Round-trips through the backend so the preview matches a real push. */}
      {isChecked && (
        <Button
          variant="light"
          color="blue"
          size="xs"
          leftSection={<IconSend size={16} stroke={1.8} />}
          loading={testMutation.isPending}
          onClick={() => testMutation.mutate()}
          data-testid={NotificationsTestIds.BtnSendTest}
        >
          Enviar notificação de teste
        </Button>
      )}
    </Stack>
  )
}
