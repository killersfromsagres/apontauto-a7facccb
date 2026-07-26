export type ParsedOsNumbers = {
  valid: string[];
  duplicates: string[];
  invalid: string[];
  originalCount: number;
};

/**
 * Aceita OS separadas por vírgula, ponto e vírgula, espaço ou quebra de linha.
 * Somente números são válidos; duplicadas são removidas preservando a ordem.
 */
export function parseOsNumbers(raw: string): ParsedOsNumbers {
  const tokens = (raw ?? "")
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const valid: string[] = [];
  const duplicates: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    if (!/^\d+$/.test(token)) {
      invalid.push(token);
      continue;
    }
    const normalized = String(Number(token));
    if (seen.has(normalized)) {
      duplicates.push(normalized);
      continue;
    }
    seen.add(normalized);
    valid.push(normalized);
  }

  return { valid, duplicates, invalid, originalCount: tokens.length };
}
