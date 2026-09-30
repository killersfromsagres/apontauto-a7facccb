import ExcelJS from "exceljs";

import type { SraCollaboratorRow } from "./data";

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function cellText(cell: ExcelJS.Cell): string | null {
  if (cell.value === null || cell.value === undefined) return null;

  if (cell.value instanceof Date) {
    return cell.value.toISOString();
  }

  if (typeof cell.value === "object") {
    if ("text" in cell.value && typeof cell.value.text === "string") {
      return clean(cell.value.text);
    }
    if ("result" in cell.value) {
      return clean(cell.value.result);
    }
    if ("richText" in cell.value && Array.isArray(cell.value.richText)) {
      return clean(
        cell.value.richText
          .map((part: { text?: string }) => part.text ?? "")
          .join(""),
      );
    }
  }

  return clean(cell.value);
}

function dateIso(cell: ExcelJS.Cell): string | null {
  const value = cell.value;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  if (typeof value === "number") {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 86400000);
    return date.toISOString().slice(0, 10);
  }

  const text = clean(cell.text || cell.value);
  if (!text) return null;

  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  return null;
}

const HEADER_ALIASES: Record<keyof SraCollaboratorRow, string[]> = {
  matricula: ["matricula"],
  nome: ["nome"],
  empresa_codigo: ["empresa"],
  filial_codigo: ["filial"],
  filial_descricao: ["descricao filial"],
  regional: ["regional"],
  local_trabalho: ["local"],
  data_treinamento: ["data do treinamento"],
  data_admissao: ["dt admissao", "data admissao"],
  data_demissao: ["dt demissao", "data demissao"],
  centro_custo: ["cc"],
  centro_resultado: ["cr"],
  supervisor: ["supervisor"],
  gerente: ["gerente"],
  gerente_regional: ["gerente regional"],
  cliente_codigo: ["cod cliente", "codigo cliente"],
  cliente: ["cliente"],
  setor_negocio: ["setor do negocio"],
  codigo_funcao: ["cod funcao", "codigo funcao"],
  funcao: ["funcao"],
  escala: ["escala"],
  situacao_sra: ["situacao"],
  sexo: ["sexo"],
  categoria_colaborador: ["cat colaborador", "categoria colaborador"],
  horario_trabalho: ["horario de trabalho"],
  intervalo_trabalho: ["intervalo"],
  sra_linha: [],
};

function findColumns(worksheet: ExcelJS.Worksheet) {
  const headerRow = worksheet.getRow(1);
  const columns = new Map<string, number>();

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const normalized = normalizeHeader(cell.text || cell.value);
    if (normalized) columns.set(normalized, colNumber);
  });

  const resolved = new Map<keyof SraCollaboratorRow, number>();

  (Object.keys(HEADER_ALIASES) as Array<keyof SraCollaboratorRow>).forEach(
    (key) => {
      for (const alias of HEADER_ALIASES[key]) {
        const column = columns.get(alias);
        if (column) {
          resolved.set(key, column);
          break;
        }
      }
    },
  );

  return resolved;
}

function readText(
  row: ExcelJS.Row,
  columns: Map<keyof SraCollaboratorRow, number>,
  key: keyof SraCollaboratorRow,
) {
  const col = columns.get(key);
  if (!col) return null;
  return cellText(row.getCell(col));
}

function readDate(
  row: ExcelJS.Row,
  columns: Map<keyof SraCollaboratorRow, number>,
  key: keyof SraCollaboratorRow,
) {
  const col = columns.get(key);
  if (!col) return null;
  return dateIso(row.getCell(col));
}

export async function parseSraWorkbook(file: File): Promise<SraCollaboratorRow[]> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Selecione o arquivo SRA no formato .xlsx.");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("A planilha SRA não possui abas.");

  const columns = findColumns(worksheet);
  if (!columns.get("matricula") || !columns.get("nome")) {
    throw new Error(
      "Não foi possível localizar as colunas Matrícula e Nome no SRA.",
    );
  }

  const rows: SraCollaboratorRow[] = [];
  const seen = new Set<string>();

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const matricula = readText(row, columns, "matricula")?.trim();
    const nome = readText(row, columns, "nome")?.trim();

    if (!matricula || !nome) continue;

    const duplicateKey = matricula.toLowerCase();
    if (seen.has(duplicateKey)) continue;
    seen.add(duplicateKey);

    rows.push({
      matricula,
      nome,
      empresa_codigo: readText(row, columns, "empresa_codigo"),
      filial_codigo: readText(row, columns, "filial_codigo"),
      filial_descricao: readText(row, columns, "filial_descricao"),
      regional: readText(row, columns, "regional"),
      local_trabalho: readText(row, columns, "local_trabalho"),
      data_treinamento: readDate(row, columns, "data_treinamento"),
      data_admissao: readDate(row, columns, "data_admissao"),
      data_demissao: readDate(row, columns, "data_demissao"),
      centro_custo: readText(row, columns, "centro_custo"),
      centro_resultado: readText(row, columns, "centro_resultado"),
      supervisor: readText(row, columns, "supervisor"),
      gerente: readText(row, columns, "gerente"),
      gerente_regional: readText(row, columns, "gerente_regional"),
      cliente_codigo: readText(row, columns, "cliente_codigo"),
      cliente: readText(row, columns, "cliente"),
      setor_negocio: readText(row, columns, "setor_negocio"),
      codigo_funcao: readText(row, columns, "codigo_funcao"),
      funcao: readText(row, columns, "funcao"),
      escala: readText(row, columns, "escala"),
      situacao_sra: readText(row, columns, "situacao_sra"),
      sexo: readText(row, columns, "sexo"),
      categoria_colaborador: readText(row, columns, "categoria_colaborador"),
      horario_trabalho: readText(row, columns, "horario_trabalho"),
      intervalo_trabalho: readText(row, columns, "intervalo_trabalho"),
      sra_linha: rowNumber,
    });
  }

  if (!rows.length) {
    throw new Error("Nenhum colaborador válido foi encontrado no arquivo SRA.");
  }

  return rows;
}
