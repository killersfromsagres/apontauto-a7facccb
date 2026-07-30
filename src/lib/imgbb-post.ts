import {
  ensureValidSession,
  refreshSessionShared,
  reportSessionFailure,
  invalidateSessionCheck,
  SessionExpiredError,
  TemporarySessionError,
} from "@/lib/session-guard";

/**
 * Envia um FormData para o proxy autenticado `/api/imgbb-upload`.
 *
 * Regras:
 * - só desconecta o usuário quando o servidor de autenticação confirma que a
 *   sessão foi revogada;
 * - falha de rede, timeout ou indisponibilidade do serviço externo são erros
 *   temporários — a tela e as fotos selecionadas são preservadas.
 */
export async function postImgbbForm(form: FormData): Promise<any> {
  const send = async (token: string) => {
    try {
      return await fetch("/api/imgbb-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
    } catch {
      throw new TemporarySessionError("Falha de rede ao enviar a imagem. Tente novamente.");
    }
  };

  let token: string;
  try {
    token = await ensureValidSession();
  } catch (err) {
    reportSessionFailure(err);
    throw err;
  }

  let res = await send(token);

  if (res.status === 401) {
    invalidateSessionCheck();
    let next: string;
    try {
      next = await refreshSessionShared();
    } catch (err) {
      reportSessionFailure(err);
      throw err;
    }
    res = await send(next);
  }

  const json = (await res.json().catch(() => ({}))) as any;

  if (!res.ok || !json?.url) {
    if (res.status === 401) {
      // Segundo 401 mesmo após renovação: sessão realmente inválida.
      const err = new SessionExpiredError();
      reportSessionFailure(err);
      throw err;
    }
    if (res.status === 403) throw new Error(json?.error ?? "Sem permissão para enviar esta imagem.");
    if (res.status === 413) throw new Error("Imagem acima do limite permitido (12 MB).");
    if (res.status === 415 || res.status === 400) {
      throw new Error(json?.error ?? "Arquivo inválido. Use JPEG, PNG ou WebP.");
    }
    if (res.status >= 500) {
      throw new TemporarySessionError("Serviço de imagens indisponível no momento. Tente novamente.");
    }
    throw new Error(json?.error ?? `Falha no envio da imagem (${res.status})`);
  }

  return json;
}
