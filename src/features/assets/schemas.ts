// Schemas de validação (Zod) para mapeamentos, opções e jobs de importação.
// Centralizam o contrato entre a UI, o worker e o banco.

import { z } from "zod";

export const assetFieldSchema = z.enum([
  "code",
  "name",
  "level",
  "parentCode",
  "parentName",
  "businessUnit",
]);

export const columnMappingSchema = z
  .record(assetFieldSchema, z.string().min(1))
  .refine((m) => Boolean(m.code), {
    message: "O mapeamento precisa indicar a coluna do código do Ativo.",
  });

export const fillOptionsSchema = z.object({
  overwrite: z.boolean(),
  addMethodColumn: z.boolean(),
  addComment: z.boolean(),
  includeCatalogSheet: z.boolean(),
});

export const totalsSchema = z.object({
  sheets: z.number().int().nonnegative(),
  rowsWithAsset: z.number().int().nonnegative(),
  tree: z.number().int().nonnegative(),
  legacy: z.number().int().nonnegative(),
  preserved: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
  unmatched: z.number().int().nonnegative(),
  changed: z.number().int().nonnegative(),
});

export const MAX_IMPORT_BYTES = 30 * 1024 * 1024;
const ALLOWED_IMPORT_EXT = [".xlsx", ".xlsm", ".xls", ".csv"];

export const importFileSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive("Arquivo vazio.").max(MAX_IMPORT_BYTES, "Arquivo excede 30MB."),
  type: z.string().max(255),
});

/** Nome de arquivo seguro para exibir, registrar e reutilizar no download. */
export function sanitizeFileName(name: string): string {
  return (name.split(/[\\/]/).pop() ?? "")
    // eslint-disable-next-line no-control-regex -- remoção intencional de caracteres de controle
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[^a-zA-Z0-9._\- ]/g, "-")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 180);
}

export function assertImportFileIsAllowed(file: { name: string; size: number; type: string }) {
  const parsed = importFileSchema.parse({
    name: sanitizeFileName(file.name),
    size: file.size,
    type: file.type ?? "",
  });
  const lower = parsed.name.toLowerCase();
  if (!ALLOWED_IMPORT_EXT.some((ext) => lower.endsWith(ext))) {
    throw new Error("Formato não suportado. Use .xlsx, .xlsm, .xls ou .csv.");
  }
  return parsed;
}

export const saveJobSchema = z.object({
  fileName: z.string().min(1).max(180),
  fileSize: z.number().int().nonnegative(),
  fileType: z.string().max(255),
  catalogId: z.string().uuid().nullable(),
  columnMapping: z.record(z.string(), z.unknown()),
  options: z.record(z.string(), z.unknown()),
  totals: totalsSchema,
  durationMs: z.number().int().nonnegative(),
});

export type ColumnMappingInput = z.infer<typeof columnMappingSchema>;
export type FillOptionsInput = z.infer<typeof fillOptionsSchema>;
