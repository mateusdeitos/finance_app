/// <reference lib="webworker" />

import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";
import { deriveDeepLink } from "@/utils/pushDeepLink";

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

// ---------------------------------------------------------------------------
// 1. Precache + cleanup outdated caches
// ---------------------------------------------------------------------------
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// ---------------------------------------------------------------------------
// 2. navigateFallback → /index.html
//    Replaces the old generateSW `navigateFallback: "/index.html"` so
//    deep-route hard refreshes still resolve the app shell.
// ---------------------------------------------------------------------------
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html")));

// ---------------------------------------------------------------------------
// 3. Preserved auth-boot NetworkFirst cache
//    Verbatim behaviour from the removed vite.config.ts `runtimeCaching` block:
//    cacheName "auth-boot", networkTimeoutSeconds 2, maxEntries 8,
//    maxAgeSeconds 86400, cacheableResponse statuses [0, 200].
// ---------------------------------------------------------------------------
registerRoute(
  ({ url }) =>
    url.pathname === "/api/auth/me" || url.pathname === "/api/onboarding/status",
  new NetworkFirst({
    cacheName: "auth-boot",
    networkTimeoutSeconds: 2,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  }),
);

// ---------------------------------------------------------------------------
// 4. Push handler (SC4)
//    Renders server-provided title/body as-is (D-24-2 — no per-type copy
//    logic here). Guards against missing/malformed payload and always calls
//    showNotification so the userVisibleOnly contract is honoured (T-24-05).
// ---------------------------------------------------------------------------
interface PushPayloadData {
  type: string;
  entity_type: "charge" | "transaction";
  entity_id: number;
}

interface PushPayload {
  title: string;
  body: string;
  data: PushPayloadData;
}

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const showFallback = (): Promise<void> =>
    self.registration.showNotification("Finance App", {
      body: "Você tem uma nova notificação.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    });

  const handlePush = async (): Promise<void> => {
    let payload: PushPayload;
    try {
      payload = event.data!.json() as PushPayload;
    } catch {
      await showFallback();
      return;
    }

    if (!payload?.title || !payload?.data) {
      await showFallback();
      return;
    }

    const url = deriveDeepLink(payload.data);
    const tag = `${payload.data.entity_type}-${payload.data.entity_id}`;

    await self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag,
      data: { url },
    });
  };

  event.waitUntil(handlePush());
});

// ---------------------------------------------------------------------------
// 5. notificationclick handler (CTRL-03)
//    Focus an open client and postMessage the navigation URL so the page
//    router handles it; or open a new window if no client exists.
//    postMessage shape: { type: "NAVIGATE", url: string }
// ---------------------------------------------------------------------------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url: string = (event.notification.data as { url?: string } | undefined)?.url ?? "/";

  const handleClick = async (): Promise<void> => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (clients.length > 0) {
      const client = clients[0];
      await client.focus();
      client.postMessage({ type: "NAVIGATE", url });
      return;
    }
    await self.clients.openWindow(url);
  };

  event.waitUntil(handleClick());
});

// ---------------------------------------------------------------------------
// 6. SKIP_WAITING message handler
//    Keeps PWAUpdateNotifier's prompt flow working — client posts
//    { type: "SKIP_WAITING" } and the SW activates immediately.
// ---------------------------------------------------------------------------
self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | undefined)?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
