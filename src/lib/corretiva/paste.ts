// Colagem rápida de OS de Corretiva (alternativa à planilha) e modelo .xlsx.
// Colunas na ordem: OS · Descrição da Atividade · Prédio · Andar · Local · Equipe · Data da Criação · Nome do Solicitante

import type { CorretivaOsImport } from "./reader";
import { downloadBlob } from "@/lib/download";

export const CORRETIVA_TEMPLATE_HEADERS = [
  "OS",
  "Descrição da Atividade",
  "Prédio",
  "Andar",
  "Local",
  "Equipe",
  "Data da Criação",
  "Nome do Solicitante",
] as const;

function parseDateBR(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const br = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (br) {
    const [, d, m, y] = br;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    return `${year}-${String(Number(m)).padStart(2, "0")}-${String(Number(d)).padStart(2, "0")}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return null;
}

function splitLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  if (line.includes(";")) return line.split(";");
  if (line.includes("|")) return line.split("|");
  return line.split(/ {2,}|,/);
}

const isHeaderLine = (cells: string[]) =>
  /^(os|ordem)/i.test((cells[0] ?? "").trim()) &&
  /descri|atividade/i.test(cells.slice(1).join(" "));

export type ColarResultado = {
  linhas: CorretivaOsImport[];
  ignoradas: number;
};

/** Converte texto colado (Excel/Sheets/CSV) em linhas prontas para o banco. */
export function parseColagemCorretiva(texto: string): ColarResultado {
  const linhas: CorretivaOsImport[] = [];
  let ignoradas = 0;
  const raw = texto.split(/\r?\n/).filter((l) => l.trim());

  for (const line of raw) {
    const cells = splitLine(line).map((c) => c.trim());
    if (isHeaderLine(cells)) continue;
    const numero = (cells[0] ?? "").replace(/\s+/g, "");
    if (!numero) {
      ignoradas++;
      continue;
    }
    linhas.push({
      numero_os: numero,
      nome_os: cells[1] || null,
      predio: cells[2] || null,
      andar: cells[3] || null,
      local: cells[4] || null,
      tipo: null,
      equipe: cells[5] || null,
      data_sla: null,
      data_programada: null,
      inicio: null,
      fim: null,
      ativo: "—",
      equipamento: cells[1] || "—",
      solicitante: cells[7] || null,
      data_criacao: parseDateBR(cells[6] ?? ""),
    });
  }

  const map = new Map<string, CorretivaOsImport>();
  for (const l of linhas) map.set(l.numero_os, l);
  return { linhas: Array.from(map.values()), ignoradas };
}

/** Gera e baixa o modelo de planilha (.xlsx) da Corretiva. */
export async function baixarModeloCorretiva() {
  const XLSX = await import("xlsx");
  const exemplo = [
    [...CORRETIVA_TEMPLATE_HEADERS],
    [
      "1540100",
      "Troca de torneira do banheiro masculino",
      "Prédio A",
      "2º andar",
      "Banheiro masculino",
      "Hidráulica",
      "27/07/2026",
      "Maria Souza",
    ],
    [
      "1540101",
      "Lâmpada queimada na sala de reunião",
      "Prédio B",
      "3º andar",
      "Sala de reunião",
      "",
      "27/07/2026",
      "João Lima",
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet(exemplo);
  ws["!cols"] = [
    { wch: 14 },
    { wch: 46 },
    { wch: 18 },
    { wch: 14 },
    { wch: 24 },
    { wch: 16 },
    { wch: 16 },
    { wch: 24 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "OS Corretiva");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "modelo-os-corretiva.xlsx",
  );
}
