import {
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core'
import { notifications as mantineNotifications } from '@mantine/notifications'
import { IconBellOff } from '@tabler/icons-react'
import { useAccounts } from '@/hooks/useAccounts'
import { useMarkAllNotificationsRead } from '@/hooks/useMarkAllNotificationsRead'
import { useMarkNotificationRead } from '@/hooks/useMarkNotificationRead'
import { useDeleteNotification } from '@/hooks/useDeleteNotification'
import { useDeleteReadNotifications } from '@/hooks/useDeleteReadNotifications'
import { useNotificationInbox } from '@/hooks/useNotificationInbox'
import { useNotificationUnreadCount } from '@/hooks/useNotificationUnreadCount'
import { useResolveNotificationAmounts } from '@/hooks/useResolveNotificationAmounts'
import { useMe } from '@/hooks/useMe'
import { renderDrawer } from '@/utils/renderDrawer'
import { NotificationsTestIds } from '@/testIds'
import { NotificationRow } from './NotificationRow'
import { ConfirmActionDrawer } from './ConfirmActionDrawer'

// ─── Partner name selector ────────────────────────────────────────────────────
// Derive the partner's display name from the accepted user_connection in cached
// accounts. The partner is the "other" user in the connection (not the current
// user). We use useMe to get the current user id, and useAccounts to get the
// connection.

function usePartnerName(): string | null {
  const { query: meQuery } = useMe((me) => me.id)
  const myId = meQuery.data ?? null

  const { query: partnerQuery } = useAccounts((accounts) => {
    for (const account of accounts) {
      const conn = account.user_connection
      if (conn && conn.connection_status === 'accepted') {
        // The current user is either the "from" or "to" user
        if (myId !== null) {
          if (conn.from_user_id === myId) {
            return conn.to_user_name ?? null
          } else {
            return conn.from_user_name ?? null
          }
        }
      }
    }
    return null
  })

  return partnerQuery.data ?? null
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface NotificationInboxContentProps {
  /**
   * Called after a row tap fires mark-read + navigate.
   * Mobile drawer passes `() => ctx.close()` to close the sheet.
   * Desktop page omits this prop.
   */
  onRowTap?: () => void
}

export function NotificationInboxContent({ onRowTap }: NotificationInboxContentProps) {
  // ── Data hooks ──────────────────────────────────────────────────────────────
  const { query, invalidate: invalidateInbox } = useNotificationInbox()
  const { query: unreadCountQuery } = useNotificationUnreadCount((d) => d.count)
  const partnerName = usePartnerName()

  // Flatten cursor pages into a single list (newest-first from API)
  const notifications = query.data?.pages.flatMap((p) => p.notifications) ?? []

  // Batch-resolve entity amounts (≤1 charges + ≤1 transactions query per page)
  const amounts = useResolveNotificationAmounts(notifications)

  // ── Mutation hooks — parent owns both, passes invalidate as onSuccess ───────
  const { mutation: markRead } = useMarkNotificationRead({
    onSuccess: invalidateInbox,
  })
  const { mutation: markAll } = useMarkAllNotificationsRead({
    onSuccess: invalidateInbox,
  })
  const { mutation: deleteOne } = useDeleteNotification({
    onSuccess: invalidateInbox,
  })
  const { mutation: deleteRead } = useDeleteReadNotifications({
    onSuccess: invalidateInbox,
  })

  const unreadCount = unreadCountQuery.data ?? 0
  // Derive whether the loaded list has at least one read row (drives "Remover lidas").
  const hasReadNotifications = notifications.some((n) => n.read)

  // ── Tap handler wired into each row ─────────────────────────────────────────
  function handleMarkRead(id: number) {
    markRead.mutate(id, {
      onError: () => {
        mantineNotifications.show({
          color: 'red',
          title: 'Erro',
          message: 'Não foi possível marcar como lida. Tente novamente.',
          autoClose: 3000,
        })
      },
    })
  }

  function handleMarkAll() {
    markAll.mutate(undefined, {
      onError: () => {
        mantineNotifications.show({
          color: 'red',
          title: 'Erro',
          message: 'Não foi possível marcar todas como lidas. Tente novamente.',
          autoClose: 3000,
        })
      },
    })
  }

  // Individual remove — fires directly (optimistic), no confirmation.
  function handleDeleteOne(id: number) {
    deleteOne.mutate(id, {
      onError: () => {
        mantineNotifications.show({
          color: 'red',
          title: 'Erro',
          message: 'Não foi possível remover a notificação. Tente novamente.',
          autoClose: 3000,
        })
      },
    })
  }

  // Bulk remove of read notifications — requires confirmation (mass action).
  async function handleDeleteRead() {
    try {
      await renderDrawer<void>(() => (
        <ConfirmActionDrawer
          title="Remover notificações lidas?"
          message="Esta ação não pode ser desfeita."
          confirmLabel="Remover"
          drawerTestId={NotificationsTestIds.ConfirmDeleteReadDrawer}
          confirmTestId={NotificationsTestIds.ConfirmDeleteReadConfirm}
        />
      ))
    } catch {
      // Dismissed without confirming — do nothing.
      return
    }

    deleteRead.mutate(undefined, {
      onError: () => {
        mantineNotifications.show({
          color: 'red',
          title: 'Erro',
          message: 'Não foi possível remover as notificações lidas. Tente novamente.',
          autoClose: 3000,
        })
      },
    })
  }

  // ── States ──────────────────────────────────────────────────────────────────

  // Loading state: show 3 skeleton rows
  if (query.isLoading) {
    return (
      <Box px="sm" py="xs">
        <Skeleton height={56} radius="md" mb="xs" />
        <Skeleton height={56} radius="md" mb="xs" />
        <Skeleton height={56} radius="md" mb="xs" />
      </Box>
    )
  }

  // Error state
  if (query.isError) {
    return (
      <Stack
        align="center"
        gap="sm"
        py="xl"
        data-testid={NotificationsTestIds.ErrorState}
      >
        <Text size="sm" c="red" ta="center">
          Não foi possível carregar as notificações.
        </Text>
        <Button
          variant="light"
          size="xs"
          onClick={() => void query.refetch()}
          data-testid={NotificationsTestIds.BtnRetry}
        >
          Tentar novamente
        </Button>
      </Stack>
    )
  }

  // Empty state
  if (notifications.length === 0) {
    return (
      <Stack
        align="center"
        gap="md"
        py="xl"
        data-testid={NotificationsTestIds.EmptyState}
      >
        <ThemeIcon size={48} variant="light" color="gray" radius="xl">
          <IconBellOff size={24} />
        </ThemeIcon>
        <Text size="sm" c="dimmed" ta="center">
          Nenhuma notificação por enquanto
        </Text>
        <Text size="xs" c="dimmed" ta="center">
          As notificações de cobranças e transações divididas aparecerão aqui.
        </Text>
      </Stack>
    )
  }

  // Populated state
  return (
    <Box>
      {/* Action row: mark-all (when unread > 0) and remover-lidas (when read > 0) */}
      {(unreadCount > 0 || hasReadNotifications) && (
        <Group justify="flex-end" px="sm" pb="xs" pt="xs" gap="xs">
          {hasReadNotifications && (
            <Button
              variant="subtle"
              color="red"
              size="sm"
              onClick={() => void handleDeleteRead()}
              disabled={deleteRead.isPending}
              rightSection={deleteRead.isPending ? <Loader size="xs" /> : null}
              data-testid={NotificationsTestIds.BtnDeleteRead}
              aria-label="Remover notificações lidas"
            >
              Remover lidas
            </Button>
          )}
          {unreadCount > 0 && (
            <Button
              variant="subtle"
              size="sm"
              onClick={handleMarkAll}
              disabled={markAll.isPending}
              rightSection={markAll.isPending ? <Loader size="xs" /> : null}
              data-testid={NotificationsTestIds.BtnMarkAllRead}
              aria-label="Marcar todas as notificações como lidas"
            >
              Marcar todas como lidas
            </Button>
          )}
        </Group>
      )}

      {/* Notification list with hairline separators */}
      {notifications.map((n, i) => {
        const resolved = amounts.get(`${n.entity_type}:${n.entity_id}`) ?? {
          amount: null,
          amountState: 'loading' as const,
          date: null,
          description: null,
        }
        return (
          <Box key={n.id}>
            <NotificationRow
              notification={n}
              resolved={resolved}
              partnerName={partnerName}
              markRead={handleMarkRead}
              deleteNotification={handleDeleteOne}
              onAfterTap={onRowTap}
            />
            {i < notifications.length - 1 && (
              <Divider ml={56} />
            )}
          </Box>
        )
      })}

      {/* Footer: load more or end indicator */}
      <Box px="sm" py="sm">
        {query.hasNextPage ? (
          <>
            <Button
              variant="outline"
              size="sm"
              fullWidth
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              rightSection={query.isFetchingNextPage ? <Loader size="xs" /> : null}
              data-testid={NotificationsTestIds.BtnLoadMore}
            >
              Carregar mais
            </Button>
            {query.isError && (
              <Text size="xs" c="red" ta="center" mt="xs">
                Erro ao carregar. Tente novamente.
              </Text>
            )}
          </>
        ) : (
          <Text size="xs" c="dimmed" ta="center">
            Você está em dia
          </Text>
        )}
      </Box>
    </Box>
  )
}
