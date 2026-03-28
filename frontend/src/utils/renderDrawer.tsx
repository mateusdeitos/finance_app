import { MantineProvider } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { QueryClientProvider } from "@tanstack/react-query";
import { createContext, ReactElement, useContext, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { queryClient } from "@/queryClient";
import { theme } from "@/theme";

// ─── Context ─────────────────────────────────────────────────────────────────

type DrawerContextValue = {
  opened: boolean;
  close: (value?: unknown) => void;
  reject: (error?: unknown) => void;
};

const DrawerContext = createContext<DrawerContextValue | undefined>(undefined);

export function useDrawerContext<T = void>() {
  const ctx = useContext(DrawerContext);
  if (!ctx)
    throw new Error("useDrawerContext must be used within renderDrawer");
  return ctx as {
    opened: boolean;
    close: (value: T) => void;
    reject: (error?: unknown) => void;
  };
}

// ─── Portal renderer ──────────────────────────────────────────────────────────

/** Duration that matches Mantine's default drawer transition so we resolve after the exit animation. */
const TRANSITION_MS = 300;

/**
 * Renders `factory()` inside an isolated React root (portal) and returns a
 * Promise that resolves with the value passed to `ctx.close(value)`.
 * Rejects when `ctx.reject(error)` is called (e.g. user dismisses without confirming).
 *
 * The portal is automatically cleaned up after the drawer exit animation.
 */
export function renderDrawer<T>(factory: () => ReactElement): Promise<T> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function teardown() {
    setTimeout(() => {
      root.unmount();
      if (document.body.contains(container))
        document.body.removeChild(container);
    }, TRANSITION_MS + 50);
  }

  return new Promise<T>((resolve, reject) => {
    const Provider = () => {
      const [opened, { close }] = useDisclosure(true);

      const ctxClose = (value: T) => {
        close();
        setTimeout(() => resolve(value), TRANSITION_MS);
      };

      const ctxReject = (error?: unknown) => {
        close();
        setTimeout(() => reject(error), TRANSITION_MS);
      };

      useEffect(() => {
        if (!opened) teardown();
      }, [opened]);

      return (
        <DrawerContext.Provider
          value={{
            opened,
            close: ctxClose as DrawerContextValue["close"],
            reject: ctxReject,
          }}
        >
          <QueryClientProvider client={queryClient}>
            <MantineProvider theme={theme}>{factory()}</MantineProvider>
          </QueryClientProvider>
        </DrawerContext.Provider>
      );
    };

    root.render(<Provider />);
  });
}
