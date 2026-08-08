/**
 * Recuperação automática quando o HTML em memória é mais velho que o deploy.
 *
 * O Cloudflare Pages (direct upload) só serve os arquivos do deploy atual no
 * domínio de produção: assim que sai uma versão nova, o `assets/*-<hash>.css|js`
 * antigo passa a responder 404. Uma aba que ainda esteja com o index.html
 * anterior — servido do precache do service worker, que roda em modo "prompt" e
 * portanto mantém a versão antiga até o usuário aceitar a atualização — pede
 * esses arquivos e recebe 404. O sintoma é página sem estilo ou chunk lazy que
 * nunca monta, e só um hard reload resolve.
 *
 * Aqui a falha vira recarga: ao detectar um asset que não carregou, pede um
 * update do service worker (para que a próxima navegação venha da versão nova)
 * e recarrega a página uma vez.
 */

// Marca a recarga já disparada. sessionStorage e não memória: a variável morre
// justamente no reload que precisamos contar.
const RELOAD_GUARD_KEY = "stale-asset-reload-at";

// Se o reload não resolveu, a falha é outra (asset realmente quebrado, rede
// caída) e insistir vira loop. Passada a janela, um deploy futuro pode
// disparar a recuperação de novo.
const RELOAD_COOLDOWN_MS = 30_000;

// Teto para a atualização do service worker: melhor recarregar com o SW ainda
// desatualizado do que deixar o usuário numa tela quebrada esperando a rede.
const SW_UPDATE_TIMEOUT_MS = 2_000;

function hasRecentlyReloaded(storage: Storage, now: number): boolean {
  const raw = storage.getItem(RELOAD_GUARD_KEY);
  if (raw === null) return false;

  const previous = Number(raw);
  if (!Number.isFinite(previous)) return false;

  return now - previous < RELOAD_COOLDOWN_MS;
}

/**
 * `true` quando o alvo do evento é um asset de build que falhou ao carregar.
 *
 * Eventos de erro de elemento não borbulham, mas passam pela fase de captura na
 * window — daí o listener registrado com `capture: true`. Imagens ficam de fora
 * de propósito: uma imagem quebrada é um bug de conteúdo, não uma pista de que
 * o bundle está desatualizado, e não justifica recarregar a página.
 */
function isAssetLoadFailure(event: Event): boolean {
  const target = event.target;

  if (target instanceof HTMLScriptElement) return target.src !== "";

  if (target instanceof HTMLLinkElement) {
    return target.rel === "stylesheet" && target.href !== "";
  }

  return false;
}

async function updateServiceWorker(): Promise<void> {
  // Checagem por capacidade, não por `"serviceWorker" in navigator`: fora de
  // contexto seguro (e no jsdom dos testes) a propriedade existe sem a API.
  const container = navigator.serviceWorker as ServiceWorkerContainer | undefined;
  if (typeof container?.getRegistration !== "function") return;

  const update = Promise.resolve()
    .then(() => container.getRegistration())
    .then((registration) => registration?.update())
    .then(() => undefined)
    // Update do SW é best-effort: a recarga acontece de qualquer jeito.
    .catch(() => undefined);

  const timeout = new Promise<void>((resolve) => {
    window.setTimeout(resolve, SW_UPDATE_TIMEOUT_MS);
  });

  await Promise.race([update, timeout]);
}

/**
 * Registra os listeners de recuperação. Idempotente por sessão via
 * `RELOAD_GUARD_KEY`; chamar mais de uma vez apenas duplica listeners inertes.
 */
export function installStaleAssetRecovery(): () => void {
  const recover = () => {
    const now = Date.now();

    if (hasRecentlyReloaded(window.sessionStorage, now)) return;
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));

    void updateServiceWorker().then(() => {
      window.location.reload();
    });
  };

  const onError = (event: Event) => {
    if (isAssetLoadFailure(event)) recover();
  };

  // Disparado pelo Vite quando um import dinâmico (rotas e componentes lazy)
  // não consegue baixar seu chunk — o caso mais comum depois de um deploy,
  // porque a navegação client-side busca o chunk sem recarregar o documento.
  const onPreloadError = () => recover();

  window.addEventListener("error", onError, true);
  window.addEventListener("vite:preloadError", onPreloadError);

  return () => {
    window.removeEventListener("error", onError, true);
    window.removeEventListener("vite:preloadError", onPreloadError);
  };
}
