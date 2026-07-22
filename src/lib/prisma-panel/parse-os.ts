/**
 * Extrai números de OS a partir de texto livre (vírgula, espaço ou quebra).
 * Deduplica preservando ordem de primeira ocorrência.
 * Considera "válido" qualquer sequência de 4-10 dígitos.
 */
export function parseOsNumbers(raw: string): string[] {
  if (!raw) return [];
  const matches = raw.match(/\d{4,10}/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    if (!seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

export function formatOsList(nums: string[]): string {
  return nums.join(", ");
}
