import { useEffect } from 'react'
import { router } from '@/router'

/**
 * Listens for NAVIGATE postMessages from the service worker and routes the SPA
 * to the specified internal path.
 *
 * The SW posts `client.postMessage({ type: "NAVIGATE", url: string })` from
 * its `notificationclick` handler (Plan 03 contract, pinned in 24-03-SUMMARY).
 *
 * Security: only navigates when:
 *   - event.data.type === "NAVIGATE"   (string-literal equality)
 *   - typeof event.data.url === "string"
 *   - event.data.url.startsWith("/")   (internal-path spoofing guard — T-24-09)
 *
 * Mount once in AppLayout (high in the authenticated component tree).
 * No state, no renders — purely an effect hook.
 */
export function useServiceWorkerNavigation(): void {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const handler = (event: MessageEvent): void => {
      const data = event.data as { type?: unknown; url?: unknown }
      if (
        data?.type === 'NAVIGATE' &&
        typeof data.url === 'string' &&
        data.url.startsWith('/')
      ) {
        void router.navigate({ to: data.url })
      }
    }

    navigator.serviceWorker.addEventListener('message', handler)
    return () => {
      navigator.serviceWorker.removeEventListener('message', handler)
    }
  }, [])
}
