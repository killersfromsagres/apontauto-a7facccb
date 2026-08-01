import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

/** Erro lançado quando o servidor de autenticação confirma que a sessão morreu. */
export class SessionExpiredError extends Error {
  constructor() {
    super("Sua sessão expirou. Entre novamente para continuar.");
    this.name = "SessionExpiredError";
  }
}

/**
 * Erro para falhas temporárias (rede instável, serviço indisponível).
 * NUNCA deve provocar logout: a sessão continua válida, só não deu para
 * confirmar/renovar agora.
 */
export class TemporarySessionError extends Error {
  constructor(message = "Não foi possível renovar a sessão agora. Tente novamente.") {
    super(message);
    this.name = "TemporarySessionError";
  }
}

function looksLikeJwt(token: string | undefined | null): token is string {
  return typeof token === "string" && token.split(".").length === 3;
}

/**
 * Só consideramos a sessão morta quando o serviço de auth diz explicitamente
 * que o refresh token não existe / foi revogado. Erros de rede, timeout ou
 * 5xx são temporários.
 */
function isRevokedSessionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { code?: string; status?: number; message?: string };
  const code = anyErr.code ?? "";
  if (
    code === "refresh_token_not_found" ||
    code === "refresh_token_already_used" ||
    code === "invalid_grant" ||
    code === "session_not_found" ||
    code === "bad_jwt"
  ) {
    return true;
  }
  // Fallback restrito: status 400/401 vindo do endpoint de token.
  if (
    (anyErr.status === 400 || anyErr.status === 401) &&
    /refresh token|invalid grant|session/i.test(anyErr.message ?? "")
  ) {
    return true;
  }
  return false;
}

let recovering = false;

/**
 * Recuperação usada apenas quando a sessão foi confirmadamente revogada.
 * Limpa o estado local e leva o usuário ao login mantendo a página de origem.
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

/**
 * Renovação compartilhada: vários uploads simultâneos reaproveitam a MESMA
 * promessa, evitando que a rotação do refresh token feita por um deles
 * invalide os demais e derrube o usuário.
 */
let inflightRefresh: Promise<string> | null = null;

export function refreshSessionShared(): Promise<string> {
  if (inflightRefresh) return inflightRefresh;
  inflightRefresh = (async () => {
    let result: Awaited<ReturnType<typeof supabase.auth.refreshSession>>;
    try {
      result = await supabase.auth.refreshSession();
    } catch {
      // Falha de rede/fetch — temporária, jamais logout.
      throw new TemporarySessionError();
    }
    if (result.error) {
      if (isRevokedSessionError(result.error)) throw new SessionExpiredError();
      throw new TemporarySessionError();
    }
    const token = result.data.session?.access_token;
    if (!looksLikeJwt(token)) throw new SessionExpiredError();
    lastVerified = 0;
    return token;
  })();
  void inflightRefresh.finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

/**
 * Garante um access token realmente aceito pelo servidor antes de chamar um
 * endpoint protegido. Revalida a sessão contra o serviço de autenticação no
 * máximo a cada 5 minutos, porque um token pode estar "no prazo" e mesmo
 * assim ter sido revogado.
 */
export async function ensureValidSession(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const expiresSoon = !session?.expires_at || session.expires_at * 1000 - Date.now() < 60_000;

  let token = looksLikeJwt(session?.access_token) && !expiresSoon ? session!.access_token : null;
  if (!token) {
    if (!session) throw new SessionExpiredError();
    token = await refreshSessionShared();
  }

  if (Date.now() - lastVerified > VERIFY_INTERVAL) {
    let checkError: unknown = null;
    try {
      const { error } = await supabase.auth.getUser();
      checkError = error;
    } catch {
      // Sem rede para validar: seguimos com o token atual em vez de deslogar.
      return token;
    }
    if (checkError) {
      if (!isRevokedSessionError(checkError)) return token;
      token = await refreshSessionShared();
    }
    lastVerified = Date.now();
  }

  return token;
}

/** Trata o erro final de uma operação protegida sem deslogar por engano. */
export function reportSessionFailure(err: unknown): void {
  if (err instanceof SessionExpiredError) {
    void handleSessionExpired();
    return;
  }
  if (err instanceof TemporarySessionError) {
    toast.error(err.message);
  }
}

/**
 * Executa uma chamada protegida garantindo sessão válida e, em caso de
 * rejeição confirmada por token, renova a sessão e tenta uma única vez mais.
 * Falhas temporárias são propagadas sem logout.
 */
export async function withValidSession<T>(run: (token: string) => Promise<T>): Promise<T> {
  let token: string;
  try {
    token = await ensureValidSession();
  } catch (err) {
    reportSessionFailure(err);
    throw err;
  }

  try {
    return await run(token);
  } catch (err) {
    const status = (err as { status?: number } | null)?.status;
    if (status !== 401 && !isRevokedSessionError(err)) throw err;
    invalidateSessionCheck();
    try {
      const next = await refreshSessionShared();
      return await run(next);
    } catch (retryErr) {
      reportSessionFailure(retryErr);
      throw retryErr;
    }
  }
}
