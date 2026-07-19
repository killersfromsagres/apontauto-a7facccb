// Armazenamento local de credenciais para login automático.
// Observação de segurança: as credenciais são gravadas apenas no navegador do
// próprio usuário (localStorage, mesma origem). Aplicamos ofuscação básica para
// evitar leitura casual — não é criptografia forte. O usuário opta explicitamente.

const KEY = "apontauto:saved-creds:v1";
const EXPIRY_KEY = "apontauto:saved-creds:exp";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias

export interface SavedCreds {
  email: string;
  password: string;
}

function encode(value: string): string {
  try {
    return btoa(unescape(encodeURIComponent(value)));
  } catch {
    return "";
  }
}

function decode(value: string): string {
  try {
    return decodeURIComponent(escape(atob(value)));
  } catch {
    return "";
  }
}

export function saveCredentials(creds: SavedCreds) {
  if (typeof window === "undefined") return;
  const payload = encode(JSON.stringify(creds));
  localStorage.setItem(KEY, payload);
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + MAX_AGE_MS));
}

export function loadCredentials(): SavedCreds | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  const exp = Number(localStorage.getItem(EXPIRY_KEY) ?? 0);
  if (!raw) return null;
  if (!exp || Date.now() > exp) {
    clearCredentials();
    return null;
  }
  try {
    const parsed = JSON.parse(decode(raw)) as SavedCreds;
    if (parsed?.email && parsed?.password) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function clearCredentials() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
  localStorage.removeItem(EXPIRY_KEY);
}

/** Estende o prazo de expiração após um login automático bem-sucedido. */
export function touchCredentials() {
  if (typeof window === "undefined") return;
  if (!localStorage.getItem(KEY)) return;
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + MAX_AGE_MS));
}

export function hasSavedCredentials(): boolean {
  if (typeof window === "undefined") return false;
  const exp = Number(localStorage.getItem(EXPIRY_KEY) ?? 0);
  return !!localStorage.getItem(KEY) && !!exp && Date.now() <= exp;
}
