import type { BackorderBuilderRow } from "@/lib/corretiva/backorder-spreadsheet-builder";

const QUERY_CHUNK_SIZE = 120;

type CorretivaOsMaterialRecord = {
  id: string;
  numero_os: string | null;
  material_status: string | null;
  pecas_solicitadas: string | null;
};

type CorretivaPecaMaterialRecord = {
  os_id: string;
  descricao: string | null;
  modelo?: string | null;
  quantidade?: number | string | null;
  material_status?: string | null;
};

export type BackorderMaterialEnrichmentResult = {
  rows: BackorderBuilderRow[];
  recoveredCount: number;
  enrichedCount: number;
  matchedOsCount: number;
  partial: boolean;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function normalizeBackorderOsKey(value: unknown) {
  let raw = String(value ?? "").trim();
  if (!raw) return "";

  raw = raw
    .replace(/^OS\s*[-:#.]?\s*/i, "")
    .replace(/([.,]0+)$/, "")
    .trim()
    .toUpperCase();

  if (/^\d+$/.test(raw)) {
    return raw.replace(/^0+(?=\d)/, "");
  }

  return raw.replace(/[^A-Z0-9]/g, "");
}

export function buildBackorderOsLookupCandidates(value: unknown) {
  const original = String(value ?? "").trim();
  if (!original) return [];

  const withoutPrefix = original.replace(/^OS\s*[-:#.]?\s*/i, "").trim();
  const withoutDecimal = withoutPrefix.replace(/([.,]0+)$/, "").trim();
  const canonical = normalizeBackorderOsKey(original);
  const values = new Set<string>();

  [original, withoutPrefix, withoutDecimal, canonical].forEach((candidate) => {
    if (candidate) values.add(candidate);
  });

  if (/^\d+$/.test(canonical)) {
    values.add(`OS ${canonical}`);
    values.add(`OS-${canonical}`);
    values.add(`OS${canonical}`);
  }

  return [...values];
}

function statusMeansRequested(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return ["SOLICIT", "PEDID", "REQUISIT", "AGUARDANDO MATERIAL", "AGUARDANDO PECA"].some(
    (part) => normalized.includes(part),
  );
}

function hasImportedMaterial(row: BackorderBuilderRow) {
  return (
    statusMeansRequested(row.material_status) ||
    Boolean(String(row.pecas_solicitadas ?? "").trim())
  );
}

function splitHistory(value: unknown) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function lineKey(value: string) {
  return normalizeText(value).replace(/[^A-Z0-9]+/g, " ").trim();
}

function mergeHistory(...values: unknown[]) {
  const lines: string[] = [];
  const seen = new Set<string>();

  const addLine = (line: string) => {
    const key = lineKey(line);
    if (!key || seen.has(key)) return;
    seen.add(key);
    lines.push(line.trim());
  };

  values.forEach((value) => splitHistory(value).forEach(addLine));
  return lines.join("\n") || null;
}

function partDescription(part: CorretivaPecaMaterialRecord) {
  const descricao = String(part.descricao ?? "").trim();
  if (!descricao) return "";

  const modelo = String(part.modelo ?? "").trim();
  const quantity = Number(part.quantidade ?? 0);
  const details = [
    modelo && !normalizeText(descricao).includes(normalizeText(modelo))
      ? `Modelo: ${modelo}`
      : "",
    Number.isFinite(quantity) && quantity > 1 ? `Qtd: ${quantity}` : "",
  ].filter(Boolean);

  return details.length ? `Peça: ${descricao} · ${details.join(" · ")}` : `Peça: ${descricao}`;
}

function historyContainsDescription(history: string | null, description: string) {
  const normalizedHistory = normalizeText(history);
  const normalizedDescription = normalizeText(description);
  return Boolean(normalizedHistory && normalizedDescription && normalizedHistory.includes(normalizedDescription));
}

export function applyBackorderMaterialEvidence(
  rows: BackorderBuilderRow[],
  osRecords: CorretivaOsMaterialRecord[],
  partRecords: CorretivaPecaMaterialRecord[],
) {
  const recordsByNumber = new Map<string, CorretivaOsMaterialRecord[]>();
  const partsByOsId = new Map<string, CorretivaPecaMaterialRecord[]>();

  osRecords.forEach((record) => {
    const key = normalizeBackorderOsKey(record.numero_os);
    if (!key) return;
    const current = recordsByNumber.get(key) ?? [];
    current.push(record);
    recordsByNumber.set(key, current);
  });

  partRecords.forEach((part) => {
    const osId = String(part.os_id ?? "").trim();
    if (!osId) return;
    const current = partsByOsId.get(osId) ?? [];
    current.push(part);
    partsByOsId.set(osId, current);
  });

  let recoveredCount = 0;
  let enrichedCount = 0;
  let matchedOsCount = 0;

  const enrichedRows = rows.map((row) => {
    const key = normalizeBackorderOsKey(row.numero_os);
    const matchedOs = key ? recordsByNumber.get(key) ?? [] : [];
    if (!matchedOs.length) return row;

    matchedOsCount += 1;
    const parts = matchedOs.flatMap((record) => partsByOsId.get(record.id) ?? []);
    const consolidatedHistory = matchedOs
      .map((record) => record.pecas_solicitadas)
      .filter((value): value is string => Boolean(String(value ?? "").trim()));

    const dbRequested =
      matchedOs.some(
        (record) =>
          statusMeansRequested(record.material_status) ||
          Boolean(String(record.pecas_solicitadas ?? "").trim()),
      ) || parts.length > 0;

    if (!dbRequested) return row;

    const hadMaterial = hasImportedMaterial(row);
    let mergedPieces = mergeHistory(row.pecas_solicitadas, ...consolidatedHistory);

    for (const part of parts) {
      const description = String(part.descricao ?? "").trim();
      if (!description || historyContainsDescription(mergedPieces, description)) continue;
      mergedPieces = mergeHistory(mergedPieces, partDescription(part));
    }

    const next: BackorderBuilderRow = {
      ...row,
      material_status: "SOLICITADO",
      pecas_solicitadas: mergedPieces,
    };

    const changed =
      next.material_status !== row.material_status ||
      next.pecas_solicitadas !== row.pecas_solicitadas;

    if (changed) enrichedCount += 1;
    if (!hadMaterial) recoveredCount += 1;
    return next;
  });

  return {
    rows: enrichedRows,
    recoveredCount,
    enrichedCount,
    matchedOsCount,
  };
}

function chunks<T>(values: T[], size = QUERY_CHUNK_SIZE) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export async function enrichBackorderRowsWithMaterialRequests(
  rows: BackorderBuilderRow[],
): Promise<BackorderMaterialEnrichmentResult> {
  if (!rows.length) {
    return {
      rows,
      recoveredCount: 0,
      enrichedCount: 0,
      matchedOsCount: 0,
      partial: false,
    };
  }

  const { supabase } = await import("@/integrations/supabase/client");
  const lookupValues = [
    ...new Set(rows.flatMap((row) => buildBackorderOsLookupCandidates(row.numero_os))),
  ];

  if (!lookupValues.length) {
    return {
      rows,
      recoveredCount: 0,
      enrichedCount: 0,
      matchedOsCount: 0,
      partial: false,
    };
  }

  const osRecords: CorretivaOsMaterialRecord[] = [];
  for (const batch of chunks(lookupValues)) {
    const { data, error } = await (supabase.from("corretiva_os") as any)
      .select("id, numero_os, material_status, pecas_solicitadas")
      .in("numero_os", batch);

    if (error) throw error;
    osRecords.push(...((data ?? []) as CorretivaOsMaterialRecord[]));
  }

  const osIds = [...new Set(osRecords.map((record) => record.id).filter(Boolean))];
  const partRecords: CorretivaPecaMaterialRecord[] = [];
  let partial = false;

  for (const batch of chunks(osIds)) {
    const { data, error } = await (supabase.from("corretiva_pecas") as any)
      .select("os_id, descricao, modelo, quantidade, material_status")
      .in("os_id", batch);

    if (error) {
      partial = true;
      console.warn(
        "[BackorderBuilder] Não foi possível consultar todas as peças solicitadas:",
        error,
      );
      break;
    }

    partRecords.push(...((data ?? []) as CorretivaPecaMaterialRecord[]));
  }

  return {
    ...applyBackorderMaterialEvidence(rows, osRecords, partRecords),
    partial,
  };
}
