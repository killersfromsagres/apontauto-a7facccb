// One normalization rule for the portal and the administrative Edge Function.
export const CLIENT_PASSWORD_MIN_LENGTH = 6;
export function isValidAccountPassword(value: string) {
  return value.length >= CLIENT_PASSWORD_MIN_LENGTH && value.length <= 128;
}
export function normalizeClientId(value: string) {
  const id = value.trim().toLowerCase();
  return /^[0-9]+$/.test(id) ? `sherwin${id}` : id;
}
export function isClientId(value: string) {
  return /^sherwin[0-9]{1,33}$/.test(value);
}
export function clientIdNumber(value: string) {
  const id = normalizeClientId(value);
  return isClientId(id) ? id.slice(7) : "";
}
export function displayClientId(value: string) {
  const number = clientIdNumber(value);
  return number ? `Sherwin${number}` : value;
}
export function clientAuthIdentity(value: string) {
  const id = normalizeClientId(value);
  if (!isClientId(id))
    throw new Error("Informe o ID no formato Sherwin seguido da numeração. Ex.: Sherwin001234.");
  return `${id}@cliente.demarchi.local`;
}
