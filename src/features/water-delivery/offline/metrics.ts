/**
 * Métricas de upload de evidências (item 24 — "métricas de upload" e
 * "logs de erro sem dados sensíveis").
 *
 * As amostras ficam apenas na memória do dispositivo e são agregadas para
 * exibição operacional. Nenhum dado pessoal (CPF, telefone, nome do
 * recebedor, coordenadas, URLs assinadas) entra nas métricas ou nos logs.
 */

export interface AmostraUpload {
  em: number;
  bytesOriginal: number;
  bytesFinal: number;
  msProcessamento: number;
  msEnvio: number;
  offThread: boolean;
  ok: boolean;
  /** Categoria genérica do erro — nunca a mensagem crua do servidor. */
  erro?: string;
}

const MAX_AMOSTRAS = 50;
const amostras: AmostraUpload[] = [];

/** Remove tokens, URLs, e-mails, CPFs e telefones de uma mensagem de erro. */
export function sanitizarErro(entrada: unknown): string {
  const bruto = entrada instanceof Error ? entrada.message : String(entrada ?? "");
  const limpo = bruto
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/gi, "[email]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]")
    .replace(/\b(?:\+?55)?\s?\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, "[telefone]")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[token]")
    .trim();
  return limpo.slice(0, 160) || "Falha no envio";
}

export function registrarUpload(amostra: AmostraUpload): void {
  amostras.push(amostra);
  if (amostras.length > MAX_AMOSTRAS) amostras.splice(0, amostras.length - MAX_AMOSTRAS);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("agua:upload-metrics"));
  }
}

export interface ResumoUpload {
  total: number;
  sucessos: number;
  falhas: number;
  taxaSucesso: number;
  mediaProcessamentoMs: number;
  mediaEnvioMs: number;
  bytesOriginais: number;
  bytesFinais: number;
  economiaPercent: number;
  offThreadPercent: number;
  ultimoErro?: string;
}

export function resumoUploads(): ResumoUpload {
  const total = amostras.length;
  const sucessos = amostras.filter((a) => a.ok).length;
  const soma = (fn: (a: AmostraUpload) => number) => amostras.reduce((acc, a) => acc + fn(a), 0);
  const bytesOriginais = soma((a) => a.bytesOriginal);
  const bytesFinais = soma((a) => a.bytesFinal);
  return {
    total,
    sucessos,
    falhas: total - sucessos,
    taxaSucesso: total ? Math.round((sucessos / total) * 100) : 0,
    mediaProcessamentoMs: total ? Math.round(soma((a) => a.msProcessamento) / total) : 0,
    mediaEnvioMs: total ? Math.round(soma((a) => a.msEnvio) / total) : 0,
    bytesOriginais,
    bytesFinais,
    economiaPercent:
      bytesOriginais > 0
        ? Math.max(0, Math.round((1 - bytesFinais / bytesOriginais) * 100))
        : 0,
    offThreadPercent: total
      ? Math.round((amostras.filter((a) => a.offThread).length / total) * 100)
      : 0,
    ultimoErro: [...amostras].reverse().find((a) => !a.ok)?.erro,
  };
}

export function limparMetricasUpload(): void {
  amostras.length = 0;
}
