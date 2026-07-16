// Leitura de planilhas XLSX do módulo Controle de Lavanderia.
// Duas modalidades:
//   - Matriz: aba "Matriz" (ou parecido) com colunas COLABORADOR + Codigo Barras.
//   - Movimentação: aba livre, colunas em pares Saída/Entrada (linha 1 = tipo, linha 2 = data).

import { toISODate } from "./schedule";

export type Categoria = "colaborador" | "reserva" | "visitante" | "avulso";

export interface MatrizRow {
  matricula: string;
  nome: string;
  codigo: string;
  categoria: Categoria;
  setor: string | null;
}

export interface EventoRow {
  codigo: string;
  tipo: "saida" | "entrada";
  data: string; // ISO YYYY-MM-DD
}

const normHeader = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function slugKey(prefix: string, raw: string): string {
  const s = normHeader(raw).replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${prefix}__${s}`.slice(0, 60);
}

function categorize(rawUpper: string): { categoria: Categoria; setor: string } | null {
  if (/^RESERVA\b/.test(rawUpper)) return { categoria: "reserva", setor: "Reserva" };
  if (/^VISITANTE\b/.test(rawUpper)) return { categoria: "visitante", setor: "Visitante" };
  if (/^TOALHA\b/.test(rawUpper)) return { categoria: "avulso", setor: "Toalhas" };
  if (/^CENTRO DE TREINAMENTO/.test(rawUpper))
    return { categoria: "avulso", setor: "Centro de Treinamento" };
  if (/^RICARDO GAZMENGA/.test(rawUpper)) return { categoria: "avulso", setor: "Itens avulsos" };
  return null;
}

/**
 * Distingue colaborador real (com matrícula numérica) de itens avulsos
 * (reservas, visitantes, toalhas), gerando matrícula sintética estável
 * para os últimos — sem misturar com matrículas reais.
 */
function parseColaborador(
  raw: string,
): { nome: string; matricula: string; categoria: Categoria; setor: string | null } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const upper = normHeader(s);

  const cat = categorize(upper);
  if (cat) {
    return {
      nome: s.replace(/\s+/g, " "),
      matricula: slugKey(cat.categoria.toUpperCase(), s),
      categoria: cat.categoria,
      setor: cat.setor,
    };
  }

  const m = s.match(/^(.*?)[\s\-–—:]+(\d{3,})\s*$/);
  if (m) {
    return {
      nome: m[1].trim().replace(/\s+/g, " "),
      matricula: m[2].trim(),
      categoria: "colaborador",
      setor: null,
    };
  }
  return {
    nome: s.replace(/\s+/g, " "),
    matricula: slugKey("AVULSO", s),
    categoria: "avulso",
    setor: "Itens avulsos",
  };
}

function excelSerialToDate(n: number): Date | null {
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;
  const utcMs = Math.round((n - 25569) * 86400 * 1000);
  return new Date(utcMs);
}

function parseAnyDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") return excelSerialToDate(v);
  const s = String(v).trim();
  const asNum = Number(s);
  if (!Number.isNaN(asNum)) {
    const d = excelSerialToDate(asNum);
    if (d) return d;
  }
  const br = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/);
  if (br) {
    const [, d, m, y] = br;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    return new Date(year, Number(m) - 1, Number(d));
  }
  const iso = new Date(s);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

/** Lê aba Matriz. Detecta automaticamente aba "matriz" ou usa a primeira. */
export async function readMatrizFile(file: File): Promise<MatrizRow[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const name = wb.SheetNames.find((n) => normHeader(n).includes("MATRIZ")) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const out: MatrizRow[] = [];
  for (const r of raw) {
    const map = new Map<string, unknown>();
    for (const k of Object.keys(r)) map.set(normHeader(k), r[k]);

    const colabRaw = String(map.get("COLABORADOR") ?? "").trim();
    const codigo = String(
      map.get("CODIGO BARRAS") ??
        map.get("CODIGO DE BARRAS") ??
        map.get("CODBARRAS") ??
        map.get("CODIGO") ??
        "",
    ).trim();

    if (!colabRaw || !codigo) continue;
    const c = parseColaborador(colabRaw);
    if (!c) continue;
    out.push({
      matricula: c.matricula,
      nome: c.nome,
      codigo,
      categoria: c.categoria,
      setor: c.setor,
    });
  }
  return out;
}

/** Lê aba de movimentação com pares Saída/Entrada. */
export async function readMovimentacaoFile(file: File): Promise<EventoRow[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  const out: EventoRow[] = [];

  for (const sheetName of wb.SheetNames) {
    if (normHeader(sheetName).includes("MATRIZ")) continue;
    const sheet = wb.Sheets[sheetName];
    // Ler como matriz crua
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: true,
    });
    if (aoa.length < 2) continue;

    const header = aoa[0] ?? [];
    const dateRow = aoa[1] ?? [];
    const numCols = Math.max(header.length, dateRow.length);

    // Identifica colunas por par (tipo + data)
    const colInfo: Array<{ tipo: "saida" | "entrada"; data: string } | null> = [];
    for (let c = 0; c < numCols; c++) {
      const rawTipo = normHeader(header[c]);
      const rawData = parseAnyDate(dateRow[c]);
      let tipo: "saida" | "entrada" | null = null;
      if (/SAID|SAI/.test(rawTipo)) tipo = "saida";
      else if (/ENTR/.test(rawTipo)) tipo = "entrada";
      if (tipo && rawData) {
        colInfo[c] = { tipo, data: toISODate(rawData) };
      } else {
        colInfo[c] = null;
      }
    }

    // Coleta códigos linha a linha, coluna a coluna
    for (let r = 2; r < aoa.length; r++) {
      const row = aoa[r] ?? [];
      for (let c = 0; c < numCols; c++) {
        const info = colInfo[c];
        if (!info) continue;
        const raw = row[c];
        if (raw == null || raw === "") continue;
        const codigo = String(raw).trim();
        if (!codigo) continue;
        out.push({ codigo, tipo: info.tipo, data: info.data });
      }
    }
  }

  // Dedup em memória (mesmo codigo+tipo+data)
  const seen = new Set<string>();
  const dedup: EventoRow[] = [];
  for (const e of out) {
    const k = `${e.codigo}|${e.tipo}|${e.data}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(e);
  }
  return dedup;
}
