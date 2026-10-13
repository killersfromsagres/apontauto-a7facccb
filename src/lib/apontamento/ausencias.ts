export type TipoAusencia = "falta" | "ferias";
export type StatusPresenca = "presente" | "falta" | "ferias";

export interface Ausencia {
  id: string;
  matricula: string;
  tipo: TipoAusencia;
  inicio: string; // YYYY-MM-DD
  fim: string; // YYYY-MM-DD
  observacao?: string;
  criadoEm: string;
}

export const AUSENCIAS_STORAGE_KEY = "apontauto:apontamentos-ausencias:v1";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function statusNaData(
  matricula: string,
  data: string,
  ausencias: readonly Ausencia[],
): StatusPresenca {
  let status: StatusPresenca = "presente";

  for (const ausencia of ausencias) {
    if (
      ausencia.matricula !== matricula ||
      data < ausencia.inicio ||
      data > ausencia.fim
    ) {
      continue;
    }

    if (ausencia.tipo === "ferias") return "ferias";
    status = "falta";
  }

  return status;
}

export function loadAusencias(): Ausencia[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(AUSENCIAS_STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isAusencia);
  } catch {
    return [];
  }
}

export function saveAusencias(ausencias: readonly Ausencia[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(AUSENCIAS_STORAGE_KEY, JSON.stringify(ausencias));
  } catch {
    // Storage indisponível ou cheio: a tela continua funcionando em memória.
  }
}

export function criarAusenciaId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `aus-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isAusencia(value: unknown): value is Ausencia {
  if (!value || typeof value !== "object") return false;

  const item = value as Partial<Ausencia>;
  return (
    typeof item.id === "string" &&
    typeof item.matricula === "string" &&
    (item.tipo === "falta" || item.tipo === "ferias") &&
    typeof item.inicio === "string" &&
    typeof item.fim === "string" &&
    DATE_RE.test(item.inicio) &&
    DATE_RE.test(item.fim) &&
    item.inicio <= item.fim &&
    typeof item.criadoEm === "string"
  );
}
