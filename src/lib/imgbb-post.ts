import {
  ensureValidSession,
  refreshSessionShared,
  reportSessionFailure,
  invalidateSessionCheck,
  SessionExpiredError,
  TemporarySessionError,
} from "@/lib/session-guard";

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Envia um FormData para o proxy autenticado `/api/imgbb-upload`.
 *
 * Regras:
 * - só desconecta o usuário quando o servidor confirma que a sessão é inválida
 *   (401 mesmo após renovar o token);
 * - indisponibilidade do servidor/serviço externo (429/5xx) e falhas de rede
 *   são temporárias: tentamos novamente com espera progressiva e mantemos a
 *   sessão e as fotos já selecionadas;
 * - o FormData é reutilizado entre tentativas (o corpo é reconstruído pelo
 *   próprio fetch a cada chamada).
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
      return null; // falha de rede — tratada como temporária
    }
  };

  let token: string;
  try {
    token = await ensureValidSession();
  } catch (err) {
    reportSessionFailure(err);
    throw err;
  }

  let lastTemporary = "Não foi possível enviar a imagem agora. Tente novamente.";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res = await send(token);

    if (res && res.status === 401) {
      // Token pode ter sido rotacionado por outro upload: renova e repete.
      invalidateSessionCheck();
      try {
        token = await refreshSessionShared();
      } catch (err) {
        reportSessionFailure(err);
        throw err;
      }
      res = await send(token);

      if (res && res.status === 401) {
        const err = new SessionExpiredError();
        reportSessionFailure(err);
        throw err;
      }
    }

    if (!res) {
      lastTemporary = "Sem conexão estável. Tentando novamente…";
    } else {
      const json = (await res.json().catch(() => ({}))) as any;

      if (res.ok && json?.url) return json;

      if (res.status === 403) {
        throw new Error(json?.error ?? "Sem permissão para enviar esta imagem.");
      }
      if (res.status === 413) throw new Error("Imagem acima do limite permitido (12 MB).");
      if (res.status === 415 || res.status === 400) {
        throw new Error(json?.error ?? "Arquivo inválido. Use JPEG, PNG ou WebP.");
      }
      if (!RETRYABLE.has(res.status)) {
        throw new Error(json?.error ?? `Falha no envio da imagem (${res.status})`);
      }
      lastTemporary =
        json?.error ??
        (res.status === 429
          ? "Muitos envios em sequência. Aguarde alguns instantes."
          : "Serviço de imagens instável. Tentando novamente…");
    }

    if (attempt < MAX_ATTEMPTS) await sleep(700 * attempt);
  }

  throw new TemporarySessionError(lastTemporary);
}
