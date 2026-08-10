// Novo gerador de Excel — Programação Semanal (design exato Seção 6).

import type { WeekBucket, WeekInfo } from "./capacity";
import { EQUIPE_COLOR, EQUIPES_ORDEM, type Equipe, type TriagedOS } from "./triage";
import { lookupAtivoEntry, type AtivoIndexEntry } from "./reader";

export const APTOS_EXTRABOLD = "Aptos ExtraBold";
export const APTOS_SEMIBOLD = "Aptos SemiBold";

const argbFromHex = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();

const HEADER_BG_L1 = argbFromHex("#002060");
const HEADER_BG_L2 = argbFromHex("#2B3095");
const NAO_LOCALIZADO_COLOR = argbFromHex("#FF0000");

const COLUMNS = [
  { key: "os", label: "OS", width: 16 },
  { key: "nome", label: "Nome", width: 38 },
  { key: "predio", label: "Prédio", width: 16 },
  { key: "andar", label: "Andar", width: 14 },
  { key: "espaco", label: "Espaço", width: 34 },
  { key: "atividade", label: "Atividade", width: 18 },
  { key: "sla", label: "Término SLA", width: 18 },
  { key: "equipe", label: "Equipe", width: 32 },
  { key: "ativo", label: "Ativo", width: 36 },
  { key: "outros", label: "Outros", width: 18 },
  { key: "seg", label: "SEGUNDA", width: 9, day: 0 },
  { key: "ter", label: "TERÇA", width: 9, day: 1 },
  { key: "qua", label: "QUARTA", width: 9, day: 2 },
  { key: "qui", label: "QUINTA", width: 9, day: 3 },
  { key: "sex", label: "SEXTA", width: 9, day: 4 },
];

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
  titleCell.font = { name: APTOS_EXTRABOLD, bold: true, size: 20, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 38;

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
      size: isDay ? 15 : 15,
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
  headerRow.height = 68;

  // Corpo — por equipe na ordem obrigatória
  const atividade = input.atividadePadrao ?? "Preventiva";
  let rowIdx = 3;

  for (const equipe of EQUIPES_ORDEM) {
    const bucket = input.bucketsPorEquipe.get(equipe);
    if (!bucket || bucket.os.length === 0) continue;

    const bg = argbFromHex(EQUIPE_COLOR[equipe]);
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
      let outrosValue: string = os.criticidade || "";
      let ativoNaoLocalizado = false;
      if (isClima) {
        const entry = lookupAtivoEntry(input.ativoIndex, os.predio, os.andar, os.local);
        const ativoFound = entry?.ativo || "";
        const equipFound = entry?.equipamento || "";
        const baseAtivo = ativoFound || ativoValue || "";
        if (baseAtivo) {
          ativoValue = baseAtivo;
        } else if (equipFound) {
          ativoValue = equipFound;
        } else {
          ativoValue = "Ativo não localizado";
          ativoNaoLocalizado = true;
        }
        // Equipamento de climatização vai para a coluna "Outros"
        if (equipFound && equipFound !== ativoValue) {
          outrosValue = outrosValue ? `${equipFound} · ${outrosValue}` : equipFound;
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
        outros: outrosValue,
        seg: dia === 0 ? 1 : "",
        ter: dia === 1 ? 1 : "",
        qua: dia === 2 ? 1 : "",
        qui: dia === 3 ? 1 : "",
        sex: dia === 4 ? 1 : "",
      };

      COLUMNS.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.value = values[c.key];

        // A coluna A (OS) agora carrega a cor da equipe.
        if (c.key === "os") {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        }
        
        // A primeira coluna (coluna 1, key: os) deve SEMPRE ter a cor da equipe 
        // para atender o requisito "coluna a preciso que coloque uma cor para cada equipe".
        // Embora já esteja acima, garantimos que qualquer equipe tenha sua cor na Coluna A.
        if (i === 0) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        }

        let color = "FF000000"; // Default text color: Black
        if (c.key === "os" || i === 0) {
          color = "FFFFFFFF"; // White text for colored Column A
        } else if (c.key === "ativo" && ativoNaoLocalizado) {
          color = NAO_LOCALIZADO_COLOR;
        }

        cell.font = {
          name: APTOS_EXTRABOLD,
          bold: true,
          size: 15,
          color: { argb: color },
        };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = {
          top: { style: "thin", color: { argb: "FFBFBFBF" } },
          bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
          left: { style: "thin", color: { argb: "FFBFBFBF" } },
          right: { style: "thin", color: { argb: "FFBFBFBF" } },
        };
      });
      row.height = 40;
      rowIdx++;
    }
  }

  // Configuração de impressão — paisagem, ajustar à largura da página.
  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9, // A4
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    printTitlesRow: "1:2",
  };

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Extrai OS de uma equipe específica de um array já triado */
export function extractByEquipe(all: TriagedOS[], equipe: Equipe): TriagedOS[] {
  return all.filter((o) => o.equipe === equipe);
}
