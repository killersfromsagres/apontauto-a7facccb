import { supabase } from "@/integrations/supabase/client";
import { ensureValidSession, SessionExpiredError } from "@/lib/session-guard";

/**
 * Envia um FormData para o proxy autenticado `/api/imgbb-upload`.
 *
 * Garante um access token válido (renovando quando necessário) e, se o
 * servidor ainda responder 401, renova a sessão e tenta uma única vez mais.
 * Isso evita o erro "Não autorizado" quando o token expira em campo.
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
    throw new SessionExpiredError();
  }

  let res = await send(token);
  if (res.status === 401) {
    const refreshed = await supabase.auth.refreshSession();
    const next = refreshed.data.session?.access_token;
    if (!next) throw new SessionExpiredError();
    res = await send(next);
  }

  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !json?.url) {
    if (res.status === 401) throw new SessionExpiredError();
    throw new Error(json?.error ?? `Falha no envio da imagem (${res.status})`);
  }
  return json;
}
