export type TipoAusencia = "falta" | "ferias";
export type StatusPresenca = "presente" | "falta" | "ferias";
export type SituacaoAusencia = "ativa" | "futura" | "encerrada";

export interface Ausencia {
  id: string;
  matricula: string;
  tipo: TipoAusencia;
  inicio: string; // YYYY-MM-DD
  fim: string; // YYYY-MM-DD
  observacao?: string;
  criadoEm: string;
  atualizadoEm?: string;
}

export const AUSENCIAS_STORAGE_KEY = "apontauto:apontamentos-ausencias:v1";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function dataLocalHoje() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateKeyToDayNumber(value: string): number | null {
  const match = DATE_RE.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return Math.floor(time / DAY_MS);
}

export function periodoContemData(inicio: string, fim: string, data: string) {
  const start = dateKeyToDayNumber(inicio);
  const end = dateKeyToDayNumber(fim);
  const target = dateKeyToDayNumber(data);
  if (start === null || end === null || target === null) return false;
  return target >= start && target <= end;
}

export function diasInclusivos(inicio: string, fim: string) {
  const start = dateKeyToDayNumber(inicio);
  const end = dateKeyToDayNumber(fim);
  if (start === null || end === null || end < start) return 0;
  return end - start + 1;
}

export function dataSeguinte(value: string) {
  const dayNumber = dateKeyToDayNumber(value);
  if (dayNumber === null) return value;
  const date = new Date((dayNumber + 1) * DAY_MS);
  return date.toISOString().slice(0, 10);
}

export function situacaoAusencia(
  ausencia: Pick<Ausencia, "inicio" | "fim">,
  referencia = dataLocalHoje(),
): SituacaoAusencia {
  const start = dateKeyToDayNumber(ausencia.inicio);
  const end = dateKeyToDayNumber(ausencia.fim);
  const ref = dateKeyToDayNumber(referencia);

  if (start === null || end === null || ref === null) return "encerrada";
  if (ref < start) return "futura";
  if (ref > end) return "encerrada";
  return "ativa";
}

export function ausenciaNaData(
  matricula: string,
  data: string,
  ausencias: readonly Ausencia[],
): Ausencia | undefined {
  if (dateKeyToDayNumber(data) === null) return undefined;

  const encontradas = ausencias.filter(
    (ausencia) =>
      ausencia.matricula === matricula &&
      periodoContemData(ausencia.inicio, ausencia.fim, data),
  );

  if (!encontradas.length) return undefined;

  return [...encontradas].sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === "ferias" ? -1 : 1;
    return String(b.criadoEm).localeCompare(String(a.criadoEm));
  })[0];
}

export function statusNaData(
  matricula: string,
  data: string,
  ausencias: readonly Ausencia[],
): StatusPresenca {
  return ausenciaNaData(matricula, data, ausencias)?.tipo ?? "presente";
}

export function periodosSobrepostos(
  a: Pick<Ausencia, "inicio" | "fim">,
  b: Pick<Ausencia, "inicio" | "fim">,
) {
  const aStart = dateKeyToDayNumber(a.inicio);
  const aEnd = dateKeyToDayNumber(a.fim);
  const bStart = dateKeyToDayNumber(b.inicio);
  const bEnd = dateKeyToDayNumber(b.fim);
  if ([aStart, aEnd, bStart, bEnd].some((value) => value === null)) return false;
  return (aStart as number) <= (bEnd as number) && (bStart as number) <= (aEnd as number);
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
  const inicio = typeof item.inicio === "string" ? dateKeyToDayNumber(item.inicio) : null;
  const fim = typeof item.fim === "string" ? dateKeyToDayNumber(item.fim) : null;

  return (
    typeof item.id === "string" &&
    typeof item.matricula === "string" &&
    (item.tipo === "falta" || item.tipo === "ferias") &&
    inicio !== null &&
    fim !== null &&
    fim >= inicio &&
    typeof item.criadoEm === "string"
  );
}
