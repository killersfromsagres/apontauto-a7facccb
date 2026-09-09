export type FuelingMeta = {
  time?: string;
  receiptPath?: string;
  receiptName?: string;
};

const META_RE = /^\[\[FLEET_META:(.*?)\]\]\s*/s;

export function parseFuelingNotes(value?: string | null): { meta: FuelingMeta; notes: string } {
  const raw = value ?? "";
  const match = raw.match(META_RE);

  if (!match) return { meta: {}, notes: raw.trim() };

  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>;
    const meta: FuelingMeta = {
      time: typeof parsed.time === "string" ? parsed.time : undefined,
      receiptPath: typeof parsed.receiptPath === "string" ? parsed.receiptPath : undefined,
      receiptName: typeof parsed.receiptName === "string" ? parsed.receiptName : undefined,
    };

    return { meta, notes: raw.slice(match[0].length).trim() };
  } catch {
    // Dados antigos ou observações que coincidentam com o prefixo continuam legíveis.
    return { meta: {}, notes: raw.trim() };
  }
}

export function buildFuelingNotes(meta: FuelingMeta, notes?: string | null): string | null {
  const cleanNotes = (notes ?? "").trim();
  const cleanMeta: FuelingMeta = {};

  if (meta.time) cleanMeta.time = meta.time;
  if (meta.receiptPath) cleanMeta.receiptPath = meta.receiptPath;
  if (meta.receiptName) cleanMeta.receiptName = meta.receiptName;

  if (Object.keys(cleanMeta).length === 0) return cleanNotes || null;

  return `[[FLEET_META:${JSON.stringify(cleanMeta)}]]${cleanNotes ? `\n${cleanNotes}` : ""}`;
}

export function fuelingDateTimeLabel(date: string, time?: string): string {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date;
  const parsed = new Date(safeDate);
  const dateLabel = Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("pt-BR");
  return time ? `${dateLabel} · ${time}` : dateLabel;
}
