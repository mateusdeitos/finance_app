import { useState, useCallback } from 'react'
import { notifications } from '@mantine/notifications'
import { fetchVapidPublicKey, postSubscription, deleteSubscription } from '@/api/pushSubscriptions'
import { urlBase64ToUint8Array } from '@/utils/urlBase64ToUint8Array'
import { usePushSubscriptionStatus } from './usePushSubscriptionStatus'

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationState = 'default' | 'requesting' | 'enabled' | 'denied' | 'unsupported'

// ── Helper copy (OD-3 verbatim from UI-SPEC) ──────────────────────────────────

const HELPER_COPY: Record<NotificationState, { mobile: string; desktop: string }> = {
  default: {
    mobile: 'Toque para ativar',
    desktop: 'Toque para ativar',
  },
  requesting: {
    mobile: 'Aguardando...',
    desktop: 'Aguardando permissão...',
  },
  enabled: {
    mobile: 'Ativadas',
    desktop: 'Ativadas neste dispositivo',
  },
  denied: {
    mobile: 'Bloqueadas pelo navegador',
    desktop: 'Bloqueadas — ative nas configurações do navegador',
  },
  unsupported: {
    mobile: 'Não suportado',
    desktop: 'Não suportado neste navegador',
  },
}

/**
 * Returns the helper copy string for a given state and surface.
 * mobile → short copy; desktop → full copy.
 */
export function notificationHelperText(
  state: NotificationState,
  surface: 'mobile' | 'desktop',
): string {
  return HELPER_COPY[state][surface]
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UsePushSubscriptionResult {
  /** Current 5-state machine state. */
  state: NotificationState
  /** Trigger subscribe (from default) or unsubscribe (from enabled). Noop in all other states. */
  onToggle: () => void
  /** Returns the helper copy string for the current state. surface: 'mobile' | 'desktop'. */
  helperText: (surface: 'mobile' | 'desktop') => string
}

/** Derives synchronously whether the browser environment supports push. */
function isBrowserSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

export function usePushSubscription(): UsePushSubscriptionResult {
  // ── Sync environment checks (derived during render — no effect) ──────────
  const supported = isBrowserSupported()
  const permissionDenied =
    supported && typeof Notification !== 'undefined' && Notification.permission === 'denied'

  // ── Local state ──────────────────────────────────────────────────────────
  // pending = true while an async subscribe/unsubscribe is in flight
  const [pending, setPending] = useState(false)
  // localEnabled: null = "use backend", true/false = known local result
  const [localEnabled, setLocalEnabled] = useState<boolean | null>(null)

  // ── Status query (gate-enabled — only runs when environment allows it) ───
  const { query: statusQuery, invalidate } = usePushSubscriptionStatus({
    enabled: supported && !permissionDenied && !pending,
  })

  // ── State derivation ──────────────────────────────────────────────────────
  let state: NotificationState

  if (!supported) {
    state = 'unsupported'
  } else if (permissionDenied) {
    state = 'denied'
  } else if (pending) {
    state = 'requesting'
  } else {
    const subscribed = localEnabled ?? statusQuery.data?.subscribed ?? false
    state = subscribed ? 'enabled' : 'default'
  }

  // ── onToggle ──────────────────────────────────────────────────────────────
  const onToggle = useCallback(async () => {
    // Only act from default (→ subscribe) or enabled (→ unsubscribe)
    if (state === 'requesting' || state === 'denied' || state === 'unsupported') {
      return
    }

    if (state === 'default') {
      // CTRL-01: requestPermission ONLY fires here, on an explicit user gesture
      const permission = await Notification.requestPermission()

      if (permission !== 'granted') {
        // Permission denied by user — transition to denied state; NO toast
        return
      }

      // Subscribe flow
      setPending(true)
      try {
        const sw = await navigator.serviceWorker.ready
        const { key } = await fetchVapidPublicKey()
        const sub = await sw.pushManager.subscribe({
          userVisibleOnly: true,
          // TS 5.9: Uint8Array<ArrayBufferLike> doesn't satisfy ArrayBufferView<ArrayBuffer>
          applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
        })
        await postSubscription(sub.toJSON() as PushSubscriptionJSON)
        setLocalEnabled(true)
        notifications.show({
          color: 'teal',
          title: 'Notificações ativadas',
          message: 'Você receberá notificações neste dispositivo.',
          autoClose: 3000,
        })
        await invalidate()
      } catch {
        setLocalEnabled(null)
        notifications.show({
          color: 'red',
          title: 'Erro ao ativar',
          message: 'Não foi possível ativar as notificações. Tente novamente.',
          autoClose: 3000,
        })
      } finally {
        setPending(false)
      }
    } else if (state === 'enabled') {
      // Unsubscribe flow
      setPending(true)
      try {
        const sw = await navigator.serviceWorker.ready
        const sub = await sw.pushManager.getSubscription()
        if (sub) {
          await deleteSubscription(sub.endpoint)
          await sub.unsubscribe()
        }
        setLocalEnabled(false)
        notifications.show({
          color: 'teal',
          title: 'Notificações desativadas',
          message: 'Notificações desativadas neste dispositivo.',
          autoClose: 3000,
        })
        await invalidate()
      } catch {
        // Revert — stay enabled
        setLocalEnabled(true)
        notifications.show({
          color: 'red',
          title: 'Erro ao desativar',
          message: 'Não foi possível desativar as notificações.',
          autoClose: 3000,
        })
      } finally {
        setPending(false)
      }
    }
  }, [state, invalidate])

  // ── Return ─────────────────────────────────────────────────────────────────
  return {
    state,
    onToggle,
    helperText: (surface: 'mobile' | 'desktop') => notificationHelperText(state, surface),
  }
}
