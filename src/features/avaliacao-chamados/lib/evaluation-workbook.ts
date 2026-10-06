export interface EvaluationRow {
  os: string;
  descricao: string;
  especialidade: string;
  solicitanteCodigo: string;
  solicitanteNome: string;
  email: string;
  estado: string;
  statusAvaliacao: string;
  textoAvaliacao: string;
  dataConclusao: string;
  sourceRow: number;
}

export interface RequesterGroup {
  key: string;
  nome: string;
  codigo: string;
  email: string;
  items: EvaluationRow[];
  emailConflict: boolean;
}

export interface EvaluationImportResult {
  sheetName: string;
  totalRows: number;
  pendingRows: number;
  duplicatesRemoved: number;
  skippedRows: number;
  groups: RequesterGroup[];
  emailColumnDetected: boolean;
}

export interface EvaluationEmailDraft {
  destinatario: string;
  assunto: string;
  corpo: string;
}

const HEADER_ALIASES = {
  os: ["NUMERO OS", "NÚMERO OS", "NUMERO DA OS", "NÚMERO DA OS", "OS", "CHAMADO", "NUMERO CHAMADO", "NÚMERO CHAMADO"],
  descricao: ["DENOMINACAO OS", "DENOMINAÇÃO OS", "DESCRICAO OS", "DESCRIÇÃO OS", "DESCRICAO", "DESCRIÇÃO", "NOME OS"],
  especialidade: ["DENOMINACAO DE ESPECIALIDADE", "DENOMINAÇÃO DE ESPECIALIDADE", "ESPECIALIDADE"],
  solicitanteCodigo: ["SOLICITANTE", "CODIGO SOLICITANTE", "CÓDIGO SOLICITANTE", "ID SOLICITANTE"],
  solicitanteNome: ["DENOMINACAO DO SOLICITANTE", "DENOMINAÇÃO DO SOLICITANTE", "DENOMINACAO SOLICITANTE", "DENOMINAÇÃO SOLICITANTE", "NOME DO SOLICITANTE", "NOME SOLICITANTE"],
  email: ["EMAIL", "E-MAIL", "EMAIL SOLICITANTE", "E-MAIL SOLICITANTE", "EMAIL DO SOLICITANTE", "E-MAIL DO SOLICITANTE", "CORREIO ELETRONICO", "CORREIO ELETRÔNICO"],
  estado: ["DENOMINACAO ESTADO OS", "DENOMINAÇÃO ESTADO OS", "ESTADO OS", "STATUS OS"],
  statusAvaliacao: ["STATUS AVALIACAO", "STATUS AVALIAÇÃO", "AVALIACAO", "AVALIAÇÃO"],
  textoAvaliacao: ["TEXTO DE AVALIACAO", "TEXTO DE AVALIAÇÃO", "TEXTO AVALIACAO", "TEXTO AVALIAÇÃO"],
  dataConclusao: ["DATA CONCLUSAO", "DATA CONCLUSÃO", "DATA DE CONCLUSAO", "DATA DE CONCLUSÃO"],
} as const;

type ColumnKey = keyof typeof HEADER_ALIASES;

type RawSheetRow = Record<string, unknown>;

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function cleanCell(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeOs(value: unknown): string {
  const raw = cleanCell(value);
  if (/^\d+\.0+$/.test(raw)) return raw.replace(/\.0+$/, "");
  return raw;
}

function findColumn(headers: string[], key: ColumnKey): string | null {
  const aliases = HEADER_ALIASES[key].map(normalizeText);
  const exact = headers.find((header) => aliases.includes(normalizeText(header)));
  if (exact) return exact;

  return (
    headers.find((header) => {
      const current = normalizeText(header);
      return aliases.some((alias) => current.includes(alias) || alias.includes(current));
    }) ?? null
  );
}

function valueFor(row: RawSheetRow, column: string | null): string {
  return column ? cleanCell(row[column]) : "";
}

function isPendingRow(statusAvaliacao: string, estado: string, hasStatusColumn: boolean): boolean {
  const status = normalizeText(statusAvaliacao);
  const state = normalizeText(estado);

  if (hasStatusColumn && status) {
    if (/NAO AVALIAD|PENDENT|AGUARD/.test(status)) return true;
    if (/AVALIAD|CONCLUID/.test(status)) return false;
  }

  if (state) {
    if (/AGUARDANDO APROVACAO|AGUARD.*AVALIACAO|PENDENT/.test(state)) return true;
    if (/CONCLUID|ENCERRAD|FINALIZAD/.test(state)) return false;
  }

  return true;
}

function stableRequesterKey(nome: string, codigo: string): string {
  return normalizeText(nome || codigo || "SOLICITANTE NAO INFORMADO");
}

export function groupEvaluationRows(rows: EvaluationRow[]): RequesterGroup[] {
  const groups = new Map<string, RequesterGroup>();

  for (const item of rows) {
    const key = stableRequesterKey(item.solicitanteNome, item.solicitanteCodigo);
    const current = groups.get(key) ?? {
      key,
      nome: item.solicitanteNome || item.solicitanteCodigo || "Solicitante não informado",
      codigo: item.solicitanteCodigo,
      email: "",
      items: [],
      emailConflict: false,
    };

    if (!current.codigo && item.solicitanteCodigo) current.codigo = item.solicitanteCodigo;
    if (item.email) {
      if (!current.email) current.email = item.email;
      else if (normalizeText(current.email) !== normalizeText(item.email)) current.emailConflict = true;
    }

    current.items.push(item);
    groups.set(key, current);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) =>
        a.os.localeCompare(b.os, "pt-BR", { numeric: true, sensitivity: "base" }),
      ),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
}

export async function parseEvaluationWorkbook(file: File): Promise<EvaluationImportResult> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("A planilha não possui nenhuma aba disponível.");

  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<RawSheetRow>(worksheet, {
    defval: "",
    raw: false,
  });

  if (rawRows.length === 0) throw new Error("A planilha está vazia.");

  const headers = Object.keys(rawRows[0] ?? {});
  const columns = {
    os: findColumn(headers, "os"),
    descricao: findColumn(headers, "descricao"),
    especialidade: findColumn(headers, "especialidade"),
    solicitanteCodigo: findColumn(headers, "solicitanteCodigo"),
    solicitanteNome: findColumn(headers, "solicitanteNome"),
    email: findColumn(headers, "email"),
    estado: findColumn(headers, "estado"),
    statusAvaliacao: findColumn(headers, "statusAvaliacao"),
    textoAvaliacao: findColumn(headers, "textoAvaliacao"),
    dataConclusao: findColumn(headers, "dataConclusao"),
  };

  if (!columns.os) throw new Error("Não encontrei a coluna do número da OS. Procure por “Número OS” ou “OS”.");
  if (!columns.descricao) throw new Error("Não encontrei a coluna “Denominação OS”/descrição do chamado.");
  if (!columns.solicitanteNome && !columns.solicitanteCodigo) {
    throw new Error("Não encontrei as colunas de solicitante na planilha.");
  }

  const unique = new Map<string, EvaluationRow>();
  let skippedRows = 0;
  let pendingRows = 0;

  rawRows.forEach((row, index) => {
    const os = normalizeOs(valueFor(row, columns.os));
    const solicitanteNome = valueFor(row, columns.solicitanteNome);
    const solicitanteCodigo = valueFor(row, columns.solicitanteCodigo);
    const descricao = valueFor(row, columns.descricao);
    const statusAvaliacao = valueFor(row, columns.statusAvaliacao);
    const estado = valueFor(row, columns.estado);

    if (!os || (!solicitanteNome && !solicitanteCodigo)) {
      skippedRows += 1;
      return;
    }

    if (!isPendingRow(statusAvaliacao, estado, Boolean(columns.statusAvaliacao))) return;
    pendingRows += 1;

    const item: EvaluationRow = {
      os,
      descricao: descricao || "Descrição não informada",
      especialidade: valueFor(row, columns.especialidade),
      solicitanteCodigo,
      solicitanteNome,
      email: valueFor(row, columns.email),
      estado,
      statusAvaliacao,
      textoAvaliacao: valueFor(row, columns.textoAvaliacao),
      dataConclusao: valueFor(row, columns.dataConclusao),
      sourceRow: index + 2,
    };

    if (!unique.has(os)) unique.set(os, item);
  });

  const items = [...unique.values()];
  const groups = groupEvaluationRows(items);

  return {
    sheetName,
    totalRows: rawRows.length,
    pendingRows: items.length,
    duplicatesRemoved: Math.max(0, pendingRows - items.length),
    skippedRows,
    groups,
    emailColumnDetected: Boolean(columns.email),
  };
}

function firstName(name: string): string {
  return cleanCell(name).split(" ").filter(Boolean)[0] || "Olá";
}

function plural(count: number, singular: string, pluralValue: string): string {
  return count === 1 ? singular : pluralValue;
}

export function buildEvaluationEmailDraft(
  group: RequesterGroup,
  selectedItems: EvaluationRow[],
  signature: string,
  recipientOverride = "",
): EvaluationEmailDraft {
  const items = selectedItems.length > 0 ? selectedItems : group.items;
  const count = items.length;
  const chamadas = items
    .map((item, index) => `${index + 1}. OS ${item.os} — ${item.descricao}`)
    .join("\n");

  const assunto =
    count === 1
      ? `Avaliação pendente do chamado OS ${items[0]?.os ?? ""} | Prisma`
      : `Avaliação pendente de ${count} chamados | Prisma`;

  const corpo = [
    `Olá, ${firstName(group.nome)}.`,
    "",
    "Tudo bem?",
    "",
    `Identificamos que ${plural(count, "o chamado abaixo, aberto em seu nome, já foi concluído e permanece pendente de avaliação", "os chamados abaixo, abertos em seu nome, já foram concluídos e permanecem pendentes de avaliação")} no sistema Prisma:`,
    "",
    chamadas,
    "",
    "Pedimos, por gentileza, que realize a avaliação dos serviços assim que possível. Seu retorno é importante para acompanharmos a qualidade dos atendimentos e direcionarmos melhorias contínuas.",
    "",
    "Orientação rápida para avaliação no Prisma:",
    "• Acesse a opção “Aprovação de Serviço” no campo superior esquerdo;",
    "• Entre em “Seleção de Registro” e selecione as OS relacionadas acima;",
    "• Para serviços aprovados, atribua uma nota de 1 a 5;",
    "• Para nota igual ou inferior a 4, inclua um comentário;",
    "• Em caso de recusa do serviço, o comentário também é obrigatório;",
    "• Finalize clicando em “Submeter aprovações”.",
    "",
    "Encaminho também o Manual de Avaliação do Prisma para apoio no procedimento.",
    "",
    "Agradecemos pela colaboração.",
    "",
    "Atenciosamente,",
    cleanCell(signature) || "Equipe de Facilities | Grupo GPS",
  ].join("\n");

  return {
    destinatario: cleanCell(recipientOverride) || group.email,
    assunto,
    corpo,
  };
}
