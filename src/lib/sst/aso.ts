// Regras puras para o Controle de ASO (Segurança do Trabalho).
// Datas são strings ISO "YYYY-MM-DD" (persistidas como DATE no banco).

export type AsoStatus = "vencido" | "critico" | "atencao" | "em_dia" | "sem_registro";

export const STATUS_LABEL: Record<AsoStatus, string> = {
  vencido: "Vencido",
  critico: "Crítico (≤7d)",
  atencao: "Atenção (≤30d)",
  em_dia: "Em dia",
  sem_registro: "Sem registro",
};

export const STATUS_COLOR: Record<AsoStatus, { fg: string; bg: string; hex: string }> = {
  vencido: { fg: "text-red-50", bg: "bg-red-600", hex: "#DC2626" },
  critico: { fg: "text-orange-50", bg: "bg-orange-600", hex: "#EA580C" },
  atencao: { fg: "text-amber-950", bg: "bg-amber-400", hex: "#FBBF24" },
  em_dia: { fg: "text-emerald-50", bg: "bg-emerald-600", hex: "#059669" },
  sem_registro: { fg: "text-slate-50", bg: "bg-slate-500", hex: "#64748B" },
};

/** Retorna hoje como "YYYY-MM-DD" no fuso local (evita drift UTC). */
export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Soma anos preservando dia/mês (ajuste para 29/fev). */
export function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  base.setUTCFullYear(base.getUTCFullYear() + years);
  const y2 = base.getUTCFullYear();
  const m2 = String(base.getUTCMonth() + 1).padStart(2, "0");
  const d2 = String(base.getUTCDate()).padStart(2, "0");
  return `${y2}-${m2}-${d2}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  base.setUTCDate(base.getUTCDate() + days);
  const y2 = base.getUTCFullYear();
  const m2 = String(base.getUTCMonth() + 1).padStart(2, "0");
  const d2 = String(base.getUTCDate()).padStart(2, "0");
  return `${y2}-${m2}-${d2}`;
}

export function diffDays(fromIso: string, toIso: string): number {
  const a = Date.UTC(...(fromIso.split("-").map(Number) as [number, number, number]));
  const b = Date.UTC(...(toIso.split("-").map(Number) as [number, number, number]));
  return Math.round((b - a) / 86400000);
}

/** Vencimento = data_exame + 1 ano (mesmo dia/mês). */
export function computeVencimento(dataExame: string | null | undefined): string | null {
  if (!dataExame) return null;
  return addYears(dataExame, 1);
}

/** Sugestão de agendamento = vencimento - 30d. */
export function computeDataSugerida(dataVencimento: string | null | undefined): string | null {
  if (!dataVencimento) return null;
  return addDays(dataVencimento, -30);
}

/** Dias até vencer (negativo = já venceu). */
export function computeDiasAVencer(dataVencimento: string | null | undefined, ref = todayIso()): number | null {
  if (!dataVencimento) return null;
  return diffDays(ref, dataVencimento);
}

export function computeStatus(dataVencimento: string | null | undefined, ref = todayIso()): AsoStatus {
  if (!dataVencimento) return "sem_registro";
  const dias = computeDiasAVencer(dataVencimento, ref)!;
  if (dias < 0) return "vencido";
  if (dias <= 7) return "critico";
  if (dias <= 30) return "atencao";
  return "em_dia";
}

/** Formata ISO em DD/MM/AAAA. Retorna "—" se vazio. */
export function fmtBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Aceita "DD/MM/AAAA", "DD-MM-AAAA", "YYYY-MM-DD" ou Date/Excel serial → ISO. */
export function parseFlexibleDate(input: unknown): string | null {
  if (input == null || input === "") return null;
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, "0");
    const d = String(input.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof input === "number" && Number.isFinite(input)) {
    // Serial Excel (base 1899-12-30)
    const ms = Math.round((input - 25569) * 86400 * 1000);
    return parseFlexibleDate(new Date(ms));
  }
  const s = String(input).trim();
  if (!s) return null;
  // ISO
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // DD/MM/YYYY ou DD-MM-YYYY
  const br = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(s);
  if (br) {
    const d = br[1].padStart(2, "0");
    const m = br[2].padStart(2, "0");
    let y = br[3];
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y}-${m}-${d}`;
  }
  return null;
}
