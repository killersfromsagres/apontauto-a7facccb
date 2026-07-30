import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

/** Erro lançado quando não há sessão válida para chamar funções do servidor. */
export class SessionExpiredError extends Error {
  constructor() {
    super("Sua sessão expirou. Entre novamente para continuar.");
    this.name = "SessionExpiredError";
  }
}

function looksLikeJwt(token: string | undefined | null): token is string {
  return typeof token === "string" && token.split(".").length === 3;
}

function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /unauthorized|invalid token|jwt|session|401/i.test(msg);
}

let recovering = false;

/**
 * Recuperação quando o servidor não reconhece mais a sessão (token revogado,
 * refresh inválido). Limpa o estado local e leva o usuário ao login mantendo
 * a página de origem, evitando ficar "logado" com uma sessão morta.
 */
export async function handleSessionExpired(): Promise<void> {
  if (recovering) return;
  recovering = true;
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    /* sessão já inválida — segue para o login */
  }
  if (typeof window === "undefined") return;
  toast.error("Sua sessão expirou. Redirecionando para o login…");
  const back = encodeURIComponent(window.location.pathname + window.location.search);
  window.setTimeout(() => {
    window.location.href = `/auth?expirada=1&redirect=${back}`;
  }, 1200);
}

/** Última vez (ms) em que o token foi validado contra o servidor. */
let lastVerified = 0;
const VERIFY_INTERVAL = 5 * 60_000;

/** Invalida o cache de verificação (usar após um 401 do servidor). */
export function invalidateSessionCheck(): void {
  lastVerified = 0;
}

async function refreshOrThrow(): Promise<string> {
  const refreshed = await supabase.auth.refreshSession();
  const token = refreshed.data.session?.access_token;
  if (!looksLikeJwt(token)) throw new SessionExpiredError();
  lastVerified = 0;
  return token;
}

/**
 * Garante um access token realmente aceito pelo servidor antes de chamar um
 * endpoint protegido. Além de checar o formato/expiração, revalida a sessão
 * contra o serviço de autenticação (no máximo a cada 5 minutos), porque um
 * token pode estar "no prazo" e mesmo assim ter sido revogado.
 */
export async function ensureValidSession(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const expiresSoon = !session?.expires_at || session.expires_at * 1000 - Date.now() < 60_000;

  let token = looksLikeJwt(session?.access_token) && !expiresSoon ? session!.access_token : null;
  if (!token) token = await refreshOrThrow();

  if (Date.now() - lastVerified > VERIFY_INTERVAL) {
    const { error } = await supabase.auth.getUser();
    if (error) {
      token = await refreshOrThrow();
      const recheck = await supabase.auth.getUser();
      if (recheck.error) throw new SessionExpiredError();
    }
    lastVerified = Date.now();
  }

  return token;
}

/**
 * Executa uma chamada protegida garantindo sessão válida e, em caso de
 * rejeição por token, renova a sessão e tenta uma única vez novamente.
 * Se ainda assim falhar, dispara a recuperação (logout local + login).
 */
export async function withValidSession<T>(run: () => Promise<T>): Promise<T> {
  try {
    await ensureValidSession();
  } catch (err) {
    void handleSessionExpired();
    throw err instanceof SessionExpiredError ? err : new SessionExpiredError();
  }

  try {
    return await run();
  } catch (err) {
    if (!isAuthError(err)) throw err;
    invalidateSessionCheck();
    try {
      await refreshOrThrow();
      return await run();
    } catch (retryErr) {
      if (!isAuthError(retryErr)) throw retryErr;
      void handleSessionExpired();
      throw new SessionExpiredError();
    }
  }
}
