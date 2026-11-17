// One normalization rule for the portal and the administrative Edge Function.
export function normalizeClientId(value: string) {
  return value.trim().toLowerCase();
}
export function isClientId(value: string) {
  return /^[a-z0-9][a-z0-9._-]{2,39}$/.test(value);
}
export function clientAuthIdentity(value: string) {
  const id = normalizeClientId(value);
  if (!isClientId(id))
    throw new Error(
      "Informe um ID de 3 a 40 caracteres, usando letras, números, ponto, hífen ou sublinhado.",
    );
  return `${id}@cliente.demarchi.local`;
}
