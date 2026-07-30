/** Utilitários de CPF: normalização, validação e mascaramento para PII. */

export function normalizeCpf(input: string): string {
  return (input ?? "").replace(/\D/g, "").slice(0, 11);
}

export function isValidCpf(input: string): boolean {
  const cpf = normalizeCpf(input);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const digits = cpf.split("").map(Number);
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += digits[i] * (len + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== digits[len]) return false;
  }
  return true;
}

export function formatCpf(input: string): string {
  const cpf = normalizeCpf(input);
  if (cpf.length !== 11) return input ?? "";
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

/** Exibição padrão para quem NÃO tem permissão de PII: ***.***.***-00 */
export function maskCpf(last4OrCpf?: string | null): string {
  const digits = normalizeCpf(last4OrCpf ?? "");
  const tail = digits.slice(-2);
  return `***.***.***-${tail || "**"}`;
}

export function cpfLast4(input: string): string {
  return normalizeCpf(input).slice(-4);
}
