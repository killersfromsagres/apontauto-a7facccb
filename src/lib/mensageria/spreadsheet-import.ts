export type SpreadsheetCell = string | number | boolean | Date | null | undefined;
export type SpreadsheetRows = SpreadsheetCell[][];

export type LegacyMaloteImport = {
  remetente: string;
  destinatario: string;
  codigo_rastreio: string | null;
  codigo_interno: string | null;
  item_descricao: string | null;
  local_recebimento: string;
  quantidade: number;
  setor: string;
  recebido_em: string | null;
  recebido_por: string;
  observacoes: string | null;
  status: "aguardando_entrega" | "entregue";
  entregue_em: null;
  entregue_para: null;
  assinatura_data_url: null;
  entrega_observacoes: string | null;
  legacy_import: true;
  legacy_source: string;
  legacy_source_row: number;
  legacy_delivery_row: number;
};

export type LegacyEnvioImport = {
  categoria: "correios" | "juridico";
  remetente: string;
  destinatario: string;
  codigo_rastreio: string | null;
  item_descricao: string | null;
  nota_fiscal: string | null;
  enviado_em: string | null;
  enviado_por: null;
  status: "enviado" | "finalizado" | "devolvido";
  finalizado_em: null;
  observacoes: string | null;
  legacy_import: true;
  legacy_source: string;
  legacy_source_row: number;
};

export type SpreadsheetImportWarning = {
  sheet: string;
  row: number;
  message: string;
};

export type MensageriaSpreadsheetImport = {
  malotes: LegacyMaloteImport[];
  envios: LegacyEnvioImport[];
  warnings: SpreadsheetImportWarning[];
};

type RowRecord = Record<string, SpreadsheetCell> & { __row: number };

const EMPTY_VALUES = new Set(["", "-", "NA", "N/A", "NÃO INFORMADO", "NAO INFORMADO"]);

function cleanText(value: SpreadsheetCell): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/\s+/g, " ");
  return EMPTY_VALUES.has(text.toLocaleUpperCase("pt-BR")) ? null : text;
}

function normalizeHeader(value: SpreadsheetCell, index: number) {
  return cleanText(value)?.toLocaleUpperCase("pt-BR") ?? `COL_${index + 1}`;
}

function normalizeCode(value: SpreadsheetCell): string | null {
  const text = cleanText(value)?.toLocaleUpperCase("pt-BR").replace(/[^A-Z0-9]/g, "") ?? null;
  return text && !EMPTY_VALUES.has(text) ? text : null;
}

function preserveCode(value: SpreadsheetCell): string | null {
  const text = cleanText(value)?.toLocaleUpperCase("pt-BR") ?? null;
  return text && !EMPTY_VALUES.has(text) ? text : null;
}

function sheetRows(rows: SpreadsheetRows | undefined): RowRecord[] {
  if (!rows?.length) return [];
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).flatMap((row, index) => {
    if (!row.some((cell) => cleanText(cell))) return [];
    return [{
      __row: index + 2,
      ...Object.fromEntries(headers.map((header, column) => [header, row[column] ?? null])),
    }];
  });
}

function excelDateToIso(value: SpreadsheetCell): string | null {
  let date: Date | null = null;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number" && Number.isFinite(value)) {
    date = new Date(Date.UTC(1899, 11, 30, 12) + Math.trunc(value) * 86_400_000);
  } else {
    const text = cleanText(value);
    if (text) {
      const brazilian = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      date = brazilian
        ? new Date(Date.UTC(Number(brazilian[3]), Number(brazilian[2]) - 1, Number(brazilian[1]), 12))
        : new Date(text);
    }
  }
  if (!date || Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12)).toISOString();
}

function quantityFromDescription(value: SpreadsheetCell) {
  const text = cleanText(value);
  const quantity = text?.match(/^\s*(\d{1,4})\b/)?.[1];
  return quantity ? Math.max(1, Number.parseInt(quantity, 10)) : 1;
}

function inferSector(...values: SpreadsheetCell[]) {
  const text = values.map((value) => cleanText(value) ?? "").join(" ").toLocaleUpperCase("pt-BR");
  const rules: Array<[RegExp, string]> = [
    [/JUR[IÍ]DIC|ADVOG|TRIBUNAL/, "JURIDICO"],
    [/MULTA|AUTUA[CÇ][AÃ]O/, "MULTAS"],
    [/DOA[CÇ][AÃ]O/, "DOACOES"],
    [/LOG[IÍ]STIC|TRANSPORT|EXPEDI[CÇ][AÃ]O/, "LOGISTICA"],
    [/COMPRAS?|FORNECEDOR/, "COMPRAS"],
    [/TELEFON|CELULAR|VIVO|CLARO|TIM\b/, "CONTAS TELEFONIA"],
    [/FINAN[CÇ]|CR[EÉ]DITO|COBRAN[CÇ]A/, "FINANCAS - CREDITOS"],
    [/SERASA|PROTESTO/, "SERASA E PROTESTO"],
    [/FEDEX|CORREIOS|FRETE/, "PAGAMENTOS DE FRETES/FEDEX CORREIOS"],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? "NÃO CLASSIFICADO";
}

function statusFromLegacy(value: SpreadsheetCell): "aguardando_entrega" | "entregue" {
  return cleanText(value)?.toLocaleUpperCase("pt-BR") === "ENTREGUE" ? "entregue" : "aguardando_entrega";
}

function envioStatus(value: SpreadsheetCell): "enviado" | "finalizado" | "devolvido" {
  const status = cleanText(value)?.toLocaleUpperCase("pt-BR");
  if (status === "FINALIZADO" || status === "ENTREGUE") return "finalizado";
  if (status === "DEVOLVIDO") return "devolvido";
  return "enviado";
}

function requiredText(value: SpreadsheetCell, fallback: string) {
  return cleanText(value) ?? fallback;
}

function parseOutbound(
  sheet: "CORREIOS" | "JURIDICOS",
  rows: RowRecord[],
  warnings: SpreadsheetImportWarning[],
): LegacyEnvioImport[] {
  return rows.map((row) => {
    const rawDate = sheet === "CORREIOS" ? row.DATA ?? row["DATA ENVIO"] : row["DATA ENVIO"];
    const enviadoEm = excelDateToIso(rawDate);
    if (!enviadoEm) warnings.push({ sheet, row: row.__row, message: "Data de envio ausente ou inválida; mantida como não informada." });
    const remetente = requiredText(row.REMETENTE, "Remetente não registrado no legado");
    const destinatario = requiredText(row.DESTINATARIO, "Destinatário não registrado no legado");
    return {
      categoria: sheet === "CORREIOS" ? "correios" : "juridico",
      remetente,
      destinatario,
      codigo_rastreio: normalizeCode(row["COD RASTREIO"]),
      item_descricao: cleanText(row.ITEM),
      nota_fiscal: cleanText(row.NF),
      enviado_em: enviadoEm,
      enviado_por: null,
      status: envioStatus(row.STATUS),
      finalizado_em: null,
      observacoes: !enviadoEm && cleanText(rawDate) ? `Valor original da data: ${cleanText(rawDate)}` : null,
      legacy_import: true,
      legacy_source: `CONTROLE MENSAGERIA/${sheet}`,
      legacy_source_row: row.__row,
    };
  });
}

export function parseMensageriaSpreadsheet(sheets: Record<string, SpreadsheetRows>): MensageriaSpreadsheetImport {
  const warnings: SpreadsheetImportWarning[] = [];
  const recebimentos = sheetRows(sheets.RECEBIMENTO);
  const entregas = sheetRows(sheets.ENTREGA);
  const receiptsByTracking = new Map<string, RowRecord>();
  for (const row of recebimentos) {
    const tracking = normalizeCode(row["COD RASTREIO"]);
    if (tracking && !receiptsByTracking.has(tracking)) receiptsByTracking.set(tracking, row);
  }

  const malotes = entregas.map((row): LegacyMaloteImport => {
    const tracking = normalizeCode(row["COD RASTREIO"]);
    const receipt = tracking ? receiptsByTracking.get(tracking) : undefined;
    const receivedAt = excelDateToIso(row["DATA RECEBIMENTO"] ?? receipt?.["DATA RECEBIMENTO"]);
    if (!receivedAt) warnings.push({ sheet: "ENTREGA", row: row.__row, message: "Data de recebimento ausente ou inválida; mantida como não informada." });
    const internalCode = preserveCode(row["COD SHERWIN"]);
    if (!internalCode) warnings.push({ sheet: "ENTREGA", row: row.__row, message: "Código interno Sherwin ausente." });
    const rawDate = row["DATA RECEBIMENTO"];
    const misplacedItem = typeof rawDate === "string" && /(CAIX|CX\b|ENVELOPE|PACOTE|DOCUMENTO)/i.test(rawDate)
      ? cleanText(rawDate)
      : null;
    const item = cleanText(receipt?.ITEM) ?? misplacedItem;
    const status = statusFromLegacy(row.STATUS);
    return {
      remetente: requiredText(row.REMETENTE, "Remetente não registrado no legado"),
      destinatario: requiredText(row.DESTINATARIO, "Destinatário não registrado no legado"),
      codigo_rastreio: tracking,
      codigo_interno: internalCode,
      item_descricao: item,
      local_recebimento: "Portaria",
      quantidade: quantityFromDescription(item),
      setor: inferSector(row.REMETENTE, row.DESTINATARIO, item, row.OBSERVACAO),
      recebido_em: receivedAt,
      recebido_por: "Não registrado no legado",
      observacoes: null,
      status,
      entregue_em: null,
      entregue_para: null,
      assinatura_data_url: null,
      entrega_observacoes: cleanText(row.OBSERVACAO),
      legacy_import: true,
      legacy_source: "CONTROLE MENSAGERIA/ENTREGA",
      legacy_source_row: row.__row,
      legacy_delivery_row: row.__row,
    };
  });

  return {
    malotes,
    envios: [
      ...parseOutbound("CORREIOS", sheetRows(sheets.CORREIOS), warnings),
      ...parseOutbound("JURIDICOS", sheetRows(sheets.JURIDICOS), warnings),
    ],
    warnings,
  };
}
