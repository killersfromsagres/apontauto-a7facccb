import { supabase } from "@/integrations/supabase/client";
import {
  ensureValidSession,
  handleSessionExpired,
  invalidateSessionCheck,
  SessionExpiredError,
} from "@/lib/session-guard";

/**
 * Envia um FormData para o proxy autenticado `/api/imgbb-upload`.
 *
 * Garante um access token realmente válido (renovando quando necessário) e,
 * se o servidor ainda responder 401, renova a sessão e tenta uma única vez
 * mais. Se nem assim funcionar, a sessão local é limpa e o usuário é levado
 * ao login — em vez de ficar preso em "Não autorizado".
 */
export async function postImgbbForm(form: FormData): Promise<any> {
  const send = async (token: string) =>
    fetch("/api/imgbb-upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

  let token: string;
  try {
    token = await ensureValidSession();
  } catch {
    void handleSessionExpired();
    throw new SessionExpiredError();
  }

  let res = await send(token);
  if (res.status === 401) {
    invalidateSessionCheck();
    const refreshed = await supabase.auth.refreshSession();
    const next = refreshed.data.session?.access_token;
    if (!next) {
      void handleSessionExpired();
      throw new SessionExpiredError();
    }
    res = await send(next);
  }

  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !json?.url) {
    if (res.status === 401) {
      void handleSessionExpired();
      throw new SessionExpiredError();
    }
    throw new Error(json?.error ?? `Falha no envio da imagem (${res.status})`);
  }
  return json;
}
