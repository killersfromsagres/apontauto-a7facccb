// Novo gerador de Excel — Programação Semanal (design exato Seção 6).

import type { WeekBucket, WeekInfo } from "./capacity";
import { EQUIPE_COLOR, EQUIPES_ORDEM, type Equipe, type TriagedOS } from "./triage";
import { lookupAtivo, type AtivoIndexEntry } from "./reader";

export const APTOS_EXTRABOLD = "Aptos ExtraBold";
export const APTOS_SEMIBOLD = "Aptos SemiBold";

const argbFromHex = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();

const HEADER_BG_L1 = argbFromHex("#002060");
const HEADER_BG_L2 = argbFromHex("#2B3095");
const NAO_LOCALIZADO_COLOR = argbFromHex("#FF0000");

const COLUMNS = [
  { key: "os", label: "OS", width: 10 },
  { key: "nome", label: "Nome", width: 38 },
  { key: "predio", label: "Prédio", width: 10 },
  { key: "andar", label: "Andar", width: 9 },
  { key: "espaco", label: "Espaço", width: 22 },
  { key: "atividade", label: "Atividade", width: 12 },
  { key: "sla", label: "Término SLA", width: 13 },
  { key: "equipe", label: "Equipe", width: 22 },
  { key: "ativo", label: "Ativo", width: 22 },
  { key: "outros", label: "Outros", width: 14 },
  { key: "seg", label: "SEGUNDA", width: 6, day: 0 },
  { key: "ter", label: "TERÇA", width: 6, day: 1 },
  { key: "qua", label: "QUARTA", width: 6, day: 2 },
  { key: "qui", label: "QUINTA", width: 6, day: 3 },
  { key: "sex", label: "SEXTA", width: 6, day: 4 },
];

function textColorForBg(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "FF000000" : "FFFFFFFF";
}

function formatSLA(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

export interface WeeklyExportInput {
  titulo: string; // Ex.: "SHERWIN WILLIAMS / DEMARCHI"
  week: WeekInfo;
  /** Buckets por equipe (uma entrada por equipe presente nesta semana) */
  bucketsPorEquipe: Map<Equipe, WeekBucket>;
  ativoIndex: Map<string, AtivoIndexEntry>;
  atividadePadrao?: "Preventiva" | "Corretiva";
}

export async function generateWeeklyProgramacao(input: WeeklyExportInput): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto";

  const ws = wb.addWorksheet("PROGRAMAÇÃO", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  // Largura das colunas
  ws.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width }));

  // Linha 1 — título
  const totalCols = COLUMNS.length;
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `${input.titulo}  ·  ${input.week.label}`;
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG_L1 } };
  titleCell.font = { name: APTOS_EXTRABOLD, bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 32;

  // Linha 2 — cabeçalho
  const headerRow = ws.getRow(2);
  COLUMNS.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.label;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG_L2 } };
    const isDay = "day" in c;
    cell.font = {
      name: APTOS_EXTRABOLD,
      bold: true,
      size: isDay ? 12 : 11,
      color: { argb: "FFFFFFFF" },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      textRotation: isDay ? 90 : 0,
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  });
  headerRow.height = 70;

  // Corpo — por equipe na ordem obrigatória
  const atividade = input.atividadePadrao ?? "Preventiva";
  let rowIdx = 3;

  for (const equipe of EQUIPES_ORDEM) {
    const bucket = input.bucketsPorEquipe.get(equipe);
    if (!bucket || bucket.os.length === 0) continue;

    const bg = argbFromHex(EQUIPE_COLOR[equipe]);
    const textColor = textColorForBg(EQUIPE_COLOR[equipe]);
    const isClima = equipe.startsWith("CLIMAT");

    // Mapa OS→dia (índice 0..4)
    const diaDeOS = new Map<string, number>();
    bucket.porDia.forEach((list, d) => {
      for (const o of list) diaDeOS.set(o.os, d);
    });

    for (const os of bucket.os) {
      const row = ws.getRow(rowIdx);
      const dia = diaDeOS.get(os.os) ?? 0;

      let ativoValue = os.ativo;
      let ativoNaoLocalizado = false;
      if (isClima) {
        const found = lookupAtivo(input.ativoIndex, os.predio, os.andar, os.local);
        if (found) ativoValue = found;
        else if (!ativoValue) {
          ativoValue = "Ativo não localizado";
          ativoNaoLocalizado = true;
        }
      }

      const values: Record<string, string | number> = {
        os: os.os,
        nome: os.nomeOS,
        predio: os.predio,
        andar: os.andar,
        espaco: os.local,
        atividade,
        sla: formatSLA(os.terminoSLA),
        equipe,
        ativo: ativoValue,
        outros: os.criticidade || "",
        seg: dia === 0 ? 1 : "",
        ter: dia === 1 ? 1 : "",
        qua: dia === 2 ? 1 : "",
        qui: dia === 3 ? 1 : "",
        sex: dia === 4 ? 1 : "",
      };

      COLUMNS.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.value = values[c.key];
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        // Coluna OS = sempre branco. Coluna Ativo (se não localizado) = vermelho.
        let color = c.key === "os" ? "FFFFFFFF" : textColor;
        if (c.key === "ativo" && ativoNaoLocalizado) color = NAO_LOCALIZADO_COLOR;
        cell.font = {
          name: APTOS_SEMIBOLD,
          bold: true,
          size: 11,
          color: { argb: color },
        };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = {
          top: { style: "hair", color: { argb: "FF000000" } },
          bottom: { style: "hair", color: { argb: "FF000000" } },
          left: { style: "hair", color: { argb: "FF000000" } },
          right: { style: "hair", color: { argb: "FF000000" } },
        };
      });
      row.height = 28;
      rowIdx++;
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Extrai OS de uma equipe específica de um array já triado */
export function extractByEquipe(all: TriagedOS[], equipe: Equipe): TriagedOS[] {
  return all.filter((o) => o.equipe === equipe);
}
