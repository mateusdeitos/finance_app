import { vi } from "vitest";

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error jsdom has no ResizeObserver
global.ResizeObserver = ResizeObserverStub;

Element.prototype.scrollIntoView = () => {};

// ── Browser Push API stubs (Wave 2 hook tests override these per-test) ────────

if (!("Notification" in globalThis)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as unknown as Record<string, unknown>)["Notification"] = {
    permission: "default" as NotificationPermission,
    requestPermission: vi.fn().mockResolvedValue("default" as NotificationPermission),
  };
}

if (!("serviceWorker" in navigator)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (navigator as unknown as Record<string, unknown>)["serviceWorker"] = {
    ready: Promise.resolve({
      pushManager: {
        subscribe: vi.fn(),
        getSubscription: vi.fn().mockResolvedValue(null),
      },
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

if (!("PushManager" in window)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as unknown as Record<string, unknown>)["PushManager"] = class PushManagerStub {};
}
