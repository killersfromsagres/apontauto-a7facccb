// Import de planilha ASO — merge incremental por CPF (fallback matrícula).
// ExcelJS é carregado sob demanda (~500 KB) apenas quando o usuário importa uma planilha.
import { computeVencimento, computeDataSugerida, parseFlexibleDate } from "./aso";

export type SstImportRow = {
  empresa: string | null;
  filial: string | null;
  cliente: string | null;
  matricula: string | null;
  cpf: string | null;
  nome: string;
  funcao: string | null;
  situacao: string | null;
  supervisor: string | null;
  data_admissao: string | null;
  data_exame_realizado: string | null;
  tipo_exame: string | null;
  data_vencimento: string | null;
  data_sugerida_agendamento: string | null;
  exame_realizado: boolean;
  observacao: string | null;
};

export type SstImportError = { sheet: string; row: number; message: string };

export type SstImportResult = {
  rows: SstImportRow[];
  errors: SstImportError[];
};

const HEADER_ALIASES: Record<keyof SstImportRow, string[]> = {
  empresa: ["empresa"],
  filial: ["filial", "unidade", "descricao filial", "descrição filial", "desc filial"],
  cliente: ["cliente"],
  matricula: ["matricula", "matrícula", "chapa", "registro"],
  cpf: ["cpf", "n cpf", "nº cpf", "numero cpf", "número cpf"],
  nome: [
    "nome",
    "colaborador",
    "funcionario",
    "funcionário",
    "nome do colaborador",
    "nome colaborador",
    "nome do funcionario",
    "nome do funcionário",
    "nome completo",
  ],
  funcao: ["funcao", "função", "cargo", "cr", "descricao cr", "descrição cr", "centro de resultado"],
  situacao: ["situacao", "situação", "status"],
  supervisor: ["supervisor", "gestor", "responsavel", "responsável"],
  data_admissao: [
    "data_admissao",
    "admissao",
    "admissão",
    "data admissão",
    "data admissao",
    "data de admissão",
    "data de admissao",
    "dt admissao",
    "dt admissão",
  ],
  data_exame_realizado: [
    "data_exame_realizado",
    "data exame",
    "data do exame",
    "data aso",
    "data do aso",
    "data exame realizado",
    "data_ultimo_exame",
    "último exame",
    "data dos exames",
    "data ultimo exame",
    "ultimo aso",
    "último aso",
  ],
  tipo_exame: [
    "tipo_exame",
    "tipo de exame",
    "tipo aso",
    "tipo do aso",
    "exames ocupacionais",
    "exame ocupacional",
    "tipo",
  ],
  data_vencimento: [
    "data_vencimento",
    "vencimento",
    "validade",
    "data validade",
    "data vencimento",
    "vencto",
    "dt vencimento",
  ],
  data_sugerida_agendamento: [
    "data_sugerida",
    "sugerido",
    "agendar em",
    "data sugerida",
    "agendamento",
    "data agendamento",
    "data do agendamento",
  ],
  exame_realizado: ["exame_realizado", "realizado", "concluido", "concluído"],
  observacao: ["observacao", "observação", "obs", "observacoes", "observações"],
};

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mapHeaders(row: (string | null | undefined)[]): Partial<Record<keyof SstImportRow, number>> {
  const map: Partial<Record<keyof SstImportRow, number>> = {};
  row.forEach((cell, idx) => {
    if (!cell) return;
    const key = norm(String(cell));
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((a) => norm(a) === key)) {
        map[field as keyof SstImportRow] = idx;
        return;
      }
    }
  });
  return map;
}

function cellString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && v !== null && "text" in (v as object)) {
    return String((v as { text: unknown }).text).trim() || null;
  }
  if (typeof v === "object" && v !== null && "result" in (v as object)) {
    return cellString((v as { result: unknown }).result);
  }
  return String(v).trim() || null;
}

function truthy(v: unknown): boolean {
  const s = cellString(v);
  if (!s) return false;
  const n = norm(s);
  return ["sim", "s", "yes", "y", "true", "1", "ok", "realizado", "concluido", "concluído"].includes(n);
}

function digits(s: string | null): string | null {
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  return d || null;
}

/** CPF é sempre 11 dígitos — planilhas exportadas como número perdem zeros à esquerda. */
function normalizeCpf(s: string | null): string | null {
  const d = digits(s);
  if (!d) return null;
  if (d.length > 11) return d.slice(-11);
  return d.padStart(11, "0");
}

export async function readSstXlsx(file: File): Promise<SstImportResult> {
  const buf = await file.arrayBuffer();
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const rows: SstImportRow[] = [];
  const errors: SstImportError[] = [];

  wb.eachSheet((sheet: import("exceljs").Worksheet) => {
    // Localiza a linha de cabeçalho (procura nas primeiras 10 linhas).
    let headerRowIdx = -1;
    let headerMap: Partial<Record<keyof SstImportRow, number>> = {};
    for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
      const values = (sheet.getRow(r).values as unknown[]).slice(1) as (string | null)[];
      const map = mapHeaders(values);
      if (map.nome != null) {
        headerRowIdx = r;
        headerMap = map;
        break;
      }
    }
    if (headerRowIdx < 0) return; // aba sem coluna Nome — ignora.

    for (let r = headerRowIdx + 1; r <= sheet.rowCount; r++) {
      const values = (sheet.getRow(r).values as unknown[]).slice(1);
      const pick = (k: keyof SstImportRow) => (headerMap[k] != null ? values[headerMap[k]!] : undefined);
      const nome = cellString(pick("nome"));
      if (!nome) continue; // linha vazia

      const dataExame = parseFlexibleDate(pick("data_exame_realizado"));
      const dataVenc =
        parseFlexibleDate(pick("data_vencimento")) ??
        (dataExame ? computeVencimento(dataExame) : null);
      const dataSug =
        parseFlexibleDate(pick("data_sugerida_agendamento")) ??
        (dataVenc ? computeDataSugerida(dataVenc) : null);

      const cpfRaw = cellString(pick("cpf"));
      const matricula = cellString(pick("matricula"));
      const cpf = digits(cpfRaw);
      if (!cpf && !matricula) {
        errors.push({ sheet: sheet.name, row: r, message: "Linha sem CPF nem matrícula — pulada." });
        continue;
      }

      // valida datas explicitamente informadas
      const rawExame = pick("data_exame_realizado");
      if (rawExame && !dataExame) {
        errors.push({ sheet: sheet.name, row: r, message: `Data de exame inválida: "${cellString(rawExame)}"` });
      }
      const rawVenc = pick("data_vencimento");
      if (rawVenc && !parseFlexibleDate(rawVenc)) {
        errors.push({ sheet: sheet.name, row: r, message: `Data de vencimento inválida: "${cellString(rawVenc)}"` });
      }

      rows.push({
        empresa: cellString(pick("empresa")),
        filial: cellString(pick("filial")),
        cliente: cellString(pick("cliente")),
        matricula,
        cpf,
        nome,
        funcao: cellString(pick("funcao")),
        situacao: cellString(pick("situacao")),
        supervisor: cellString(pick("supervisor")),
        data_admissao: parseFlexibleDate(pick("data_admissao")),
        data_exame_realizado: dataExame,
        tipo_exame: cellString(pick("tipo_exame")),
        data_vencimento: dataVenc,
        data_sugerida_agendamento: dataSug,
        exame_realizado: truthy(pick("exame_realizado")) || !!dataExame,
        observacao: cellString(pick("observacao")),
      });
    }
  });

  // Deduplica dentro da própria planilha (mantém a última ocorrência).
  const seen = new Map<string, number>();
  const dedup: SstImportRow[] = [];
  for (const r of rows) {
    const key = r.cpf ?? `M:${r.matricula}`;
    if (seen.has(key)) dedup[seen.get(key)!] = r;
    else {
      seen.set(key, dedup.length);
      dedup.push(r);
    }
  }

  return { rows: dedup, errors };
}
