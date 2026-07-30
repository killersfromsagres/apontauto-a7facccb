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
  return /unauthorized|invalid token|jwt|401/i.test(msg);
}

/**
 * Garante que exista um access token válido (formato JWT e não expirado)
 * antes de chamar um server function protegido. Renova quando necessário.
 */
export async function ensureValidSession(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const expiresSoon = !session?.expires_at || session.expires_at * 1000 - Date.now() < 60_000;

  if (looksLikeJwt(session?.access_token) && !expiresSoon) return session!.access_token;

  const refreshed = await supabase.auth.refreshSession();
  const token = refreshed.data.session?.access_token;
  if (looksLikeJwt(token)) return token;

  throw new SessionExpiredError();
}

/**
 * Executa uma chamada protegida garantindo sessão válida e, em caso de
 * rejeição por token, renova a sessão e tenta uma única vez novamente.
 */
export async function withValidSession<T>(run: () => Promise<T>): Promise<T> {
  await ensureValidSession();
  try {
    return await run();
  } catch (err) {
    if (!isAuthError(err)) throw err;
    const refreshed = await supabase.auth.refreshSession();
    if (!looksLikeJwt(refreshed.data.session?.access_token)) throw new SessionExpiredError();
    return run();
  }
}
