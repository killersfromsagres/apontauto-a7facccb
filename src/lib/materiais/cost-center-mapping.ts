import { supabase } from "@/integrations/supabase/client";

export type AssetCostCenterRecord = {
  asset_code: string;
  cost_center: string;
  asset_name?: string | null;
  source_name?: string | null;
  imported_at?: string | null;
};

export type CostCenterImportResult = {
  imported: number;
  ignored: number;
  conflicts: number;
  conflictAssets: string[];
  sheets: string[];
};

const ASSET_HEADERS = [
  "ativo",
  "codigo ativo",
  "codigo do ativo",
  "tag",
  "asset",
  "asset code",
];

const COST_CENTER_HEADERS = [
  "centro de custo",
  "centro custo",
  "centro de custos",
  "cc",
  "cost center",
];

const ASSET_NAME_HEADERS = [
  "denominacao ativo",
  "denominacao do ativo",
  "descricao ativo",
  "descricao do ativo",
  "nome ativo",
];

export function normalizeAssetCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function normalizeCostCenter(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ");
}

function findHeaderIndex(row: unknown[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeHeader);
  return row.findIndex((cell) => {
    const header = normalizeHeader(cell);
    return normalizedAliases.some(
      (alias) => header === alias || header.replace(/\s/g, "") === alias.replace(/\s/g, ""),
    );
  });
}

export async function fetchAssetCostCenterMap() {
  const client = supabase as any;
  const { data, error } = await client
    .from("material_asset_cost_centers")
    .select("asset_code, cost_center, asset_name, source_name, imported_at")
    .order("asset_code");

  if (error) throw new Error(error.message || "Falha ao carregar a base de centros de custo.");

  const map = new Map<string, AssetCostCenterRecord>();
  for (const row of (data ?? []) as AssetCostCenterRecord[]) {
    const asset = normalizeAssetCode(row.asset_code);
    const costCenter = normalizeCostCenter(row.cost_center);
    if (!asset || !costCenter) continue;
    map.set(asset, { ...row, asset_code: asset, cost_center: costCenter });
  }
  return map;
}

export function resolveCostCenter(
  item: { centro_custo?: string | null } | null | undefined,
  os: { ativo?: string | null } | null | undefined,
  mappings?: Map<string, AssetCostCenterRecord>,
) {
  const persisted = normalizeCostCenter(item?.centro_custo);
  if (persisted) return persisted;
  const asset = normalizeAssetCode(os?.ativo);
  if (!asset || !mappings) return "";
  return mappings.get(asset)?.cost_center || "";
}

export async function importAssetCostCentersFromFile(file: File): Promise<CostCenterImportResult> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  const valuesByAsset = new Map<string, Set<string>>();
  const assetNameByAsset = new Map<string, string>();
  const sheets: string[] = [];
  let ignored = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    if (!rows.length) continue;

    let headerRow = -1;
    let assetColumn = -1;
    let costCenterColumn = -1;
    let assetNameColumn = -1;

    for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
      const row = rows[rowIndex] || [];
      const possibleAsset = findHeaderIndex(row, ASSET_HEADERS);
      const possibleCc = findHeaderIndex(row, COST_CENTER_HEADERS);
      if (possibleAsset >= 0 && possibleCc >= 0) {
        headerRow = rowIndex;
        assetColumn = possibleAsset;
        costCenterColumn = possibleCc;
        assetNameColumn = findHeaderIndex(row, ASSET_NAME_HEADERS);
        break;
      }
    }

    if (headerRow < 0) continue;
    sheets.push(sheetName);

    for (let rowIndex = headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      const asset = normalizeAssetCode(row[assetColumn]);
      const costCenter = normalizeCostCenter(row[costCenterColumn]);
      if (!asset || !costCenter) {
        ignored += 1;
        continue;
      }

      const values = valuesByAsset.get(asset) || new Set<string>();
      values.add(costCenter);
      valuesByAsset.set(asset, values);

      if (assetNameColumn >= 0) {
        const assetName = String(row[assetNameColumn] ?? "").trim();
        if (assetName && !assetNameByAsset.has(asset)) assetNameByAsset.set(asset, assetName);
      }
    }
  }

  if (!sheets.length) {
    throw new Error(
      "Não encontrei as colunas “Ativo” e “Centro de Custo” na planilha. Verifique os cabeçalhos e tente novamente.",
    );
  }

  const conflictAssets: string[] = [];
  const rowsToUpsert: AssetCostCenterRecord[] = [];
  const importedAt = new Date().toISOString();

  for (const [asset, centers] of valuesByAsset.entries()) {
    if (centers.size !== 1) {
      conflictAssets.push(asset);
      continue;
    }
    rowsToUpsert.push({
      asset_code: asset,
      cost_center: [...centers][0],
      asset_name: assetNameByAsset.get(asset) || null,
      source_name: file.name,
      imported_at: importedAt,
    });
  }

  if (!rowsToUpsert.length) {
    throw new Error(
      conflictAssets.length
        ? "A planilha possui vínculos conflitantes de Centro de Custo para os mesmos ativos. Nenhum vínculo seguro foi importado."
        : "Nenhum vínculo válido entre Ativo e Centro de Custo foi encontrado.",
    );
  }

  const client = supabase as any;
  const CHUNK = 250;
  for (let index = 0; index < rowsToUpsert.length; index += CHUNK) {
    const batch = rowsToUpsert.slice(index, index + CHUNK);
    const { error } = await client
      .from("material_asset_cost_centers")
      .upsert(batch, { onConflict: "asset_code" });
    if (error) throw new Error(error.message || "Falha ao atualizar a base de centros de custo.");
  }

  return {
    imported: rowsToUpsert.length,
    ignored,
    conflicts: conflictAssets.length,
    conflictAssets: conflictAssets.slice(0, 20),
    sheets,
  };
}
