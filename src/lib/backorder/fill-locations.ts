// Preenche colunas Prédio / Andar / Ambiente em qualquer workbook enviado,
// reproduzindo o VLOOKUP manual (LEFT(ativo,5) / LEFT(ativo,7) / ativo)
// sobre a árvore de ativos (embutida na aba `ativos` do próprio arquivo
// e/ou já persistida em `assets_ref`). Preserva o restante do arquivo.

import type ExcelJS from "exceljs";
import { buildAssetsIndex, resolveAtivoTree, type AssetsMap } from "./assets";

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Extrai texto de qualquer valor de célula (inclusive fórmulas / rich text). */
function cellText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((r: any) => r.text ?? "").join("");
    }
    if ("result" in v && v.result != null) return String(v.result);
    if ("text" in v) return String(v.text ?? "");
    if ("hyperlink" in v && "text" in v) return String(v.text ?? "");
  }
  return String(v);
}

function extractEmbeddedAssets(wb: ExcelJS.Workbook) {
  const ws = wb.worksheets.find((s) => {
    const n = norm(s.name);
    return n === "ATIVOS" || n === "ATIVO" || n.includes("CADASTRO DE ATIVO");
  });
  if (!ws)
    return [] as Array<{
      ativo: string;
      denominacao?: string;
      nivel?: string;
      codigo_pai?: string | null;
    }>;
  const header = ws.getRow(1);
  const idx: Record<string, number> = {};
  header.eachCell((cell, col) => {
    const key = norm(cellText(cell.value));
    if (key === "ATIVO" || key === "CODIGO" || key === "TAG") idx.ativo = col;
    else if (
      key.startsWith("DENOMINACAO ATIVO") ||
      key === "DENOMINACAO" ||
      key === "NOME" ||
      key === "DESCRICAO"
    )
      idx.denominacao = col;
    else if (key.includes("NIVEL")) idx.nivel = col;
    else if (key === "ATIVO PAI" || key === "CODIGO PAI" || key === "PAI") idx.pai = col;
  });
  if (!idx.ativo) return [];
  const out: any[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const ativo = cellText(row.getCell(idx.ativo).value).trim().toUpperCase();
    if (!ativo) continue;
    out.push({
      ativo,
      denominacao: idx.denominacao ? cellText(row.getCell(idx.denominacao).value).trim() : "",
      nivel: idx.nivel ? cellText(row.getCell(idx.nivel).value).trim() : "",
      codigo_pai: idx.pai
        ? cellText(row.getCell(idx.pai).value).trim().toUpperCase() || null
        : null,
    });
  }
  return out;
}

interface SheetMap {
  ws: ExcelJS.Worksheet;
  headerRow: number;
  cAtivo: number;
  cPredio?: number;
  cAndar?: number;
  cAmbiente?: number;
}

function mapSheet(ws: ExcelJS.Worksheet): SheetMap | null {
  const maxScan = Math.min(ws.rowCount, 20);
  for (let r = 1; r <= maxScan; r++) {
    const row = ws.getRow(r);
    let cAtivo = 0;
    let cPredio = 0;
    let cAndar = 0;
    let cAmbiente = 0;
    row.eachCell((cell, col) => {
      const k = norm(cellText(cell.value));
      if (!k) return;
      if (k === "ATIVO" && !cAtivo)
        cAtivo = col; // "Ativo" exato — evita casar "Denominação Ativo"
      else if (k === "PREDIO" || k === "PREDIO / AREA" || k === "AREA") cPredio = col;
      else if (k === "ANDAR" || k === "PAVIMENTO") cAndar = col;
      else if (k === "AMBIENTE" || k === "LOCAL" || k === "ESPACO") cAmbiente = col;
    });
    if (cAtivo && (cPredio || cAndar || cAmbiente)) {
      return {
        ws,
        headerRow: r,
        cAtivo,
        cPredio: cPredio || undefined,
        cAndar: cAndar || undefined,
        cAmbiente: cAmbiente || undefined,
      };
    }
  }
  return null;
}

export interface FillResult {
  blob: Blob;
  filename: string;
  sheetsProcessed: Array<{ name: string; filled: number; missing: number }>;
  totalFilled: number;
  totalMissing: number;
}

export async function fillLocationsInWorkbook(
  file: File,
  fallback: AssetsMap,
): Promise<FillResult> {
  const ExcelJSMod = (await import("exceljs")).default;
  const wb = new ExcelJSMod.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const embedded = extractEmbeddedAssets(wb);
  const merged: AssetsMap = embedded.length
    ? buildAssetsIndex([
        ...Array.from((fallback as any).byCodigo?.values?.() ?? []).map((n: any) => ({
          ativo: n.codigo,
          denominacao: n.nome,
          nivel: n.nivel,
          codigo_pai: n.codigoPai,
        })),
        ...embedded,
      ])
    : fallback;

  const sheetsProcessed: FillResult["sheetsProcessed"] = [];
  let totalFilled = 0;
  let totalMissing = 0;

  for (const ws of wb.worksheets) {
    const n = norm(ws.name);
    if (n === "ATIVOS" || n === "ATIVO" || n.includes("CADASTRO DE ATIVO")) continue;
    const map = mapSheet(ws);
    if (!map) continue;
    let filled = 0;
    let missing = 0;
    for (let r = map.headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const ativo = cellText(row.getCell(map.cAtivo).value).trim().toUpperCase();
      if (!ativo) continue;
      const res = resolveAtivoTree(merged, ativo);
      if (map.cPredio) row.getCell(map.cPredio).value = res.predio || null;
      if (map.cAndar) row.getCell(map.cAndar).value = res.andar || null;
      if (map.cAmbiente) row.getCell(map.cAmbiente).value = res.espaco || null;
      if (res.predio || res.andar || res.espaco) filled++;
      else missing++;
    }
    sheetsProcessed.push({ name: ws.name, filled, missing });
    totalFilled += filled;
    totalMissing += missing;
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const base = file.name.replace(/\.xlsx$/i, "");
  return {
    blob,
    filename: `${base}-preenchido.xlsx`,
    sheetsProcessed,
    totalFilled,
    totalMissing,
  };
}
