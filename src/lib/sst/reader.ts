// Leitor de planilha ASO / Cadastro — extrai TODAS as colunas relevantes.
// ExcelJS é carregado sob demanda apenas quando o usuário importa uma planilha.
import { computeVencimento, computeDataSugerida, parseFlexibleDate } from "./aso";

export type SstImportRow = {
  // núcleo
  empresa: string | null;
  filial: string | null;
  descricao_filial: string | null;
  cliente: string | null;
  matricula: string | null;
  cpf: string | null;
  nome: string;
  funcao: string | null;
  cod_funcao: string | null;
  descricao_funcao: string | null;
  situacao: string | null;
  supervisor: string | null;
  gerente: string | null;
  gerente_regional: string | null;
  diretor: string | null;
  diretor_executivo: string | null;
  regional: string | null;
  negocio: string | null;
  tipo_contrato: string | null;
  escala: string | null;
  horario_trabalho: string | null;
  sexo: string | null;
  rg: string | null;
  data_nascimento: string | null;
  municipio: string | null;
  estado: string | null;
  pis: string | null;
  ctps: string | null;
  serie_ctps: string | null;
  cc: string | null;
  cr: string | null;
  data_admissao: string | null;
  data_demissao: string | null;
  // ASO
  data_exame_realizado: string | null;
  tipo_exame: string | null;
  data_vencimento: string | null;
  data_sugerida_agendamento: string | null;
  exame_realizado: boolean;
  observacao: string | null;
  // qualquer cabeçalho fora dos aliases vai para cá
  dados_extras: Record<string, string>;
};

export type SstImportError = { sheet: string; row: number; message: string };
export type SstImportResult = { rows: SstImportRow[]; errors: SstImportError[] };

type CoreKey = Exclude<keyof SstImportRow, "dados_extras" | "exame_realizado">;

const HEADER_ALIASES: Record<CoreKey, string[]> = {
  empresa: ["empresa"],
  filial: ["filial", "unidade"],
  descricao_filial: ["descricao filial", "descrição filial", "desc filial"],
  cliente: ["cliente", "cod cliente", "cód cliente"],
  matricula: ["matricula", "matrícula", "chapa", "registro"],
  cpf: ["cpf", "n cpf", "nº cpf", "numero cpf", "número cpf"],
  nome: [
    "nome", "colaborador", "funcionario", "funcionário",
    "nome do colaborador", "nome colaborador",
    "nome do funcionario", "nome do funcionário", "nome completo",
  ],
  funcao: ["funcao", "função", "cargo", "cr", "centro de resultado"],
  cod_funcao: ["cod funcao", "código função", "cod função"],
  descricao_funcao: ["descricao funcao", "descrição função", "desc funcao"],
  situacao: ["situacao", "situação", "status"],
  supervisor: ["supervisor", "gestor", "responsavel", "responsável"],
  gerente: ["gerente"],
  gerente_regional: ["gerente regional", "ger regional"],
  diretor: ["diretor"],
  diretor_executivo: ["diretor executivo", "dir executivo"],
  regional: ["regional"],
  negocio: ["negocio", "negócio"],
  tipo_contrato: ["tipo de contrato", "tipo contrato"],
  escala: ["escala"],
  horario_trabalho: ["horario de trabalho", "horário de trabalho", "horario", "horário"],
  sexo: ["sexo", "genero", "gênero"],
  rg: ["rg"],
  data_nascimento: ["dt nascimento", "data nascimento", "data de nascimento", "nascimento"],
  municipio: ["municipio", "município", "cidade"],
  estado: ["estado", "uf"],
  pis: ["pis", "pis/pasep", "pis pasep"],
  ctps: ["numero ctps", "número ctps", "ctps"],
  serie_ctps: ["serie ctps", "série ctps"],
  cc: ["cc", "centro de custo"],
  cr: ["cr"],
  data_admissao: ["data admissao", "data admissão", "data de admissao", "data de admissão", "dt admissao", "dt admissão", "admissao", "admissão"],
  data_demissao: ["data demissao", "data demissão", "dt demissao", "dt demissão", "demissao", "demissão"],
  data_exame_realizado: [
    "data exame realizado", "data exame", "data do exame", "data aso", "data do aso",
    "data dos exames", "data ultimo exame", "data último exame",
    "ultimo aso", "último aso", "data_ultimo_exame",
  ],
  tipo_exame: [
    "tipo de exame", "tipo aso", "tipo do aso",
    "exames ocupacionais", "exame ocupacional", "tipo",
  ],
  data_vencimento: [
    "data vencimento", "data de vencimento", "vencimento",
    "validade", "data validade", "vencto", "dt vencimento",
    "data de vencimento (1 ano)",
  ],
  data_sugerida_agendamento: [
    "data sugerida de agendamento", "data sugerida", "sugerido",
    "agendar em", "agendamento", "data agendamento", "data do agendamento",
    "data sugerida de agendamento (30 dias antes)",
  ],
  observacao: ["observacao", "observação", "obs", "observacoes", "observações"],
};

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s()/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapHeaders(row: unknown[]): {
  core: Partial<Record<CoreKey, number>>;
  extras: { idx: number; header: string }[];
} {
  const core: Partial<Record<CoreKey, number>> = {};
  const extras: { idx: number; header: string }[] = [];
  row.forEach((cell, idx) => {
    if (!cell) return;
    const raw = String(cell).trim();
    const key = norm(raw);
    if (!key) return;
    let matched = false;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((a) => norm(a) === key)) {
        if (core[field as CoreKey] == null) core[field as CoreKey] = idx;
        matched = true;
        break;
      }
    }
    if (!matched) extras.push({ idx, header: raw });
  });
  return { core, extras };
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
  return ["sim", "s", "yes", "y", "true", "1", "ok", "realizado", "concluido"].includes(n);
}

function digits(s: string | null): string | null {
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  return d || null;
}

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
    // localiza cabeçalho nas primeiras 15 linhas (planilhas exportadas trazem título/subtítulo)
    let headerRowIdx = -1;
    let headerCore: Partial<Record<CoreKey, number>> = {};
    let headerExtras: { idx: number; header: string }[] = [];
    for (let r = 1; r <= Math.min(15, sheet.rowCount); r++) {
      const values = (sheet.getRow(r).values as unknown[]).slice(1);
      const { core, extras } = mapHeaders(values);
      if (core.nome != null) {
        headerRowIdx = r;
        headerCore = core;
        headerExtras = extras;
        break;
      }
    }
    if (headerRowIdx < 0) return;

    for (let r = headerRowIdx + 1; r <= sheet.rowCount; r++) {
      const values = (sheet.getRow(r).values as unknown[]).slice(1);
      const pick = (k: CoreKey) => (headerCore[k] != null ? values[headerCore[k]!] : undefined);
      const nome = cellString(pick("nome"));
      if (!nome) continue;

      const dataExame = parseFlexibleDate(pick("data_exame_realizado"));
      const dataVenc =
        parseFlexibleDate(pick("data_vencimento")) ??
        (dataExame ? computeVencimento(dataExame) : null);
      const dataSug =
        parseFlexibleDate(pick("data_sugerida_agendamento")) ??
        (dataVenc ? computeDataSugerida(dataVenc) : null);

      const cpfRaw = cellString(pick("cpf"));
      const matricula = cellString(pick("matricula"));
      const cpf = normalizeCpf(cpfRaw);
      if (!cpf && !matricula) {
        errors.push({ sheet: sheet.name, row: r, message: `${nome}: sem CPF nem matrícula — linha pulada.` });
        continue;
      }

      const funcaoRaw = cellString(pick("funcao"));
      const funcao = funcaoRaw && funcaoRaw.includes(" - ")
        ? funcaoRaw.split(" - ").pop()!.trim()
        : funcaoRaw;

      const agendRaw = pick("data_sugerida_agendamento");
      const agendText = !parseFlexibleDate(agendRaw) ? cellString(agendRaw) : null;
      const obsBase = cellString(pick("observacao"));
      const observacao = [obsBase, agendText].filter(Boolean).join(" — ") || null;

      const dados_extras: Record<string, string> = {};
      for (const { idx, header } of headerExtras) {
        const v = cellString(values[idx]);
        if (v) dados_extras[header] = v;
      }

      rows.push({
        empresa: cellString(pick("empresa")),
        filial: cellString(pick("filial")),
        descricao_filial: cellString(pick("descricao_filial")),
        cliente: cellString(pick("cliente")),
        matricula,
        cpf,
        nome,
        funcao,
        cod_funcao: cellString(pick("cod_funcao")),
        descricao_funcao: cellString(pick("descricao_funcao")),
        situacao: cellString(pick("situacao")),
        supervisor: cellString(pick("supervisor")),
        gerente: cellString(pick("gerente")),
        gerente_regional: cellString(pick("gerente_regional")),
        diretor: cellString(pick("diretor")),
        diretor_executivo: cellString(pick("diretor_executivo")),
        regional: cellString(pick("regional")),
        negocio: cellString(pick("negocio")),
        tipo_contrato: cellString(pick("tipo_contrato")),
        escala: cellString(pick("escala")),
        horario_trabalho: cellString(pick("horario_trabalho")),
        sexo: cellString(pick("sexo")),
        rg: cellString(pick("rg")),
        data_nascimento: parseFlexibleDate(pick("data_nascimento")),
        municipio: cellString(pick("municipio")),
        estado: cellString(pick("estado")),
        pis: cellString(pick("pis")),
        ctps: cellString(pick("ctps")),
        serie_ctps: cellString(pick("serie_ctps")),
        cc: cellString(pick("cc")),
        cr: cellString(pick("cr")),
        data_admissao: parseFlexibleDate(pick("data_admissao")),
        data_demissao: parseFlexibleDate(pick("data_demissao")),
        data_exame_realizado: dataExame,
        tipo_exame: cellString(pick("tipo_exame")),
        data_vencimento: dataVenc,
        data_sugerida_agendamento: dataSug,
        exame_realizado: truthy(pick("exame_realizado")) || !!dataExame,
        observacao,
        dados_extras,
      });
    }
  });

  // Dedup por CPF (fallback matrícula) — mantém último preenchido, mesclando extras.
  const seen = new Map<string, number>();
  const dedup: SstImportRow[] = [];
  for (const r of rows) {
    const key = r.cpf ?? `M:${r.matricula}`;
    if (seen.has(key)) {
      const prev = dedup[seen.get(key)!];
      dedup[seen.get(key)!] = {
        ...prev,
        ...Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null && v !== "" && !(typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0))),
        dados_extras: { ...prev.dados_extras, ...r.dados_extras },
      } as SstImportRow;
    } else {
      seen.set(key, dedup.length);
      dedup.push(r);
    }
  }

  return { rows: dedup, errors };
}
