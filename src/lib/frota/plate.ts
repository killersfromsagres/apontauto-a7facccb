/** Utilidades de placa (padrão antigo ABC-1234 e Mercosul ABC1D23). */

const OLD = /^[A-Z]{3}[0-9]{4}$/;
const MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

/** Remove separadores e normaliza para maiúsculas (máx. 7 caracteres). */
export function normalizePlate(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 7);
}

export function isValidPlate(input: string): boolean {
  const p = normalizePlate(input);
  return OLD.test(p) || MERCOSUL.test(p);
}

/** Exibição amigável: ABC-1234 (antigo) ou ABC1D23 (Mercosul). */
export function formatPlate(input: string | null | undefined): string {
  if (!input) return "";
  const p = normalizePlate(input);
  if (OLD.test(p)) return `${p.slice(0, 3)}-${p.slice(3)}`;
  return p;
}

/** Máscara progressiva enquanto o usuário digita. */
export function maskPlateInput(input: string): string {
  const p = normalizePlate(input);
  if (p.length > 3 && /^[0-9]{1,4}$/.test(p.slice(3))) {
    return `${p.slice(0, 3)}-${p.slice(3)}`;
  }
  return p;
}
