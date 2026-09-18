export type BackorderInput = {
  tipo?: string | null;
  tipo_importacao?: string | null;
  data_criacao?: string | null;
  status?: string | null;
};

export type BackorderSource = "explicit" | "automatic" | null;

export type BackorderInfo = {
  isBackorder: boolean;
  ageDays: number;
  source: BackorderSource;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function parseDate(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
  }

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isOpenForAutomaticBackorder(status: unknown) {
  const normalized = normalize(status);
  if (!normalized) return true;

  return ![
    "CONCLUID",
    "FINALIZ",
    "FECHAD",
    "ENCERRAD",
    "CANCELAD",
  ].some((value) => normalized.includes(value));
}

function isExplicitBackorder(input: BackorderInput) {
  return [input.tipo, input.tipo_importacao]
    .map(normalize)
    .some((value) => value === "BACKORDER" || value.startsWith("BACKORDER "));
}

/**
 * Identifica Backorder sem qualquer dependência do antigo sistema de prioridade.
 *
 * Regras:
 * - respeita registros já marcados explicitamente como BACKORDER;
 * - classifica automaticamente chamados ainda abertos com mais de 30 dias;
 * - nunca transforma status encerrado/concluído/cancelado em Backorder automático.
 */
export function getBackorderInfo(
  input: BackorderInput,
  referenceDate: Date = new Date(),
): BackorderInfo {
  const created = parseDate(input.data_criacao);
  const reference = startOfDay(referenceDate);
  const ageDays = created
    ? Math.max(
        0,
        Math.floor(
          (reference.getTime() - startOfDay(created).getTime()) / 86_400_000,
        ),
      )
    : 0;

  const explicit = isExplicitBackorder(input);
  const automatic =
    Boolean(created) && ageDays > 30 && isOpenForAutomaticBackorder(input.status);

  return {
    isBackorder: explicit || automatic,
    ageDays,
    source: explicit ? "explicit" : automatic ? "automatic" : null,
  };
}
