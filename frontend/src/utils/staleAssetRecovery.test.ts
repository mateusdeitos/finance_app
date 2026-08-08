import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installStaleAssetRecovery } from "./staleAssetRecovery";

const RELOAD_GUARD_KEY = "stale-asset-reload-at";

function dispatchAssetError(element: Element): void {
  const event = new Event("error");
  Object.defineProperty(event, "target", { value: element });
  window.dispatchEvent(event);
}

function stylesheetLink(): HTMLLinkElement {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://app.example/assets/index-abc123.css";
  return link;
}

describe("installStaleAssetRecovery", () => {
  let reload: ReturnType<typeof vi.fn>;
  let uninstall: () => void;

  beforeEach(() => {
    reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
    window.sessionStorage.clear();
    uninstall = installStaleAssetRecovery();
  });

  afterEach(() => {
    uninstall();
    vi.useRealTimers();
  });

  it("recarrega quando uma folha de estilo falha ao carregar", async () => {
    dispatchAssetError(stylesheetLink());

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it("recarrega quando um script falha ao carregar", async () => {
    const script = document.createElement("script");
    script.src = "https://app.example/assets/index-abc123.js";

    dispatchAssetError(script);

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it("recarrega quando o Vite reporta falha de preload de chunk", async () => {
    window.dispatchEvent(new Event("vite:preloadError"));

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it("ignora imagem quebrada — não é sinal de bundle desatualizado", async () => {
    const image = document.createElement("img");
    image.src = "https://app.example/avatar.png";

    dispatchAssetError(image);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(reload).not.toHaveBeenCalled();
  });

  it("recarrega uma única vez, mesmo com vários assets falhando", async () => {
    dispatchAssetError(stylesheetLink());
    dispatchAssetError(stylesheetLink());
    dispatchAssetError(stylesheetLink());

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("não recarrega de novo dentro da janela de cooldown", async () => {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now() - 1_000));

    dispatchAssetError(stylesheetLink());

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(reload).not.toHaveBeenCalled();
  });

  it("volta a recarregar depois do cooldown — um deploy futuro merece nova tentativa", async () => {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now() - 60_000));

    dispatchAssetError(stylesheetLink());

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it("para de reagir depois de desinstalado", async () => {
    uninstall();

    dispatchAssetError(stylesheetLink());

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(reload).not.toHaveBeenCalled();
  });
});
