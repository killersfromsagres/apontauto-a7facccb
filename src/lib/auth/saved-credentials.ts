// Preferência local de "lembrar usuário".
//
// IMPORTANTE (segurança): NENHUMA senha é armazenada pela aplicação.
// Guardamos apenas o identificador de login (para pré-preencher o campo)
// e a preferência de reconexão automática. A sessão em si é mantida e
// renovada pelo próprio backend de autenticação (refresh token), nunca
// por credenciais em texto no navegador.

const KEY = "apontauto:remember-login:v2";
const EXPIRY_KEY = "apontauto:remember-login:exp";
const LEGACY_KEYS = ["apontauto:saved-creds:v1", "apontauto:saved-creds:exp"];
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias

export interface RememberedLogin {
  email: string;
}

/** Remove qualquer credencial gravada por versões antigas do app. */
function purgeLegacy() {
  if (typeof window === "undefined") return;
  for (const k of LEGACY_KEYS) localStorage.removeItem(k);
}

export function saveLogin(email: string) {
  if (typeof window === "undefined") return;
  purgeLegacy();
  localStorage.setItem(KEY, email.trim().toLowerCase());
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + MAX_AGE_MS));
}

export function loadLogin(): RememberedLogin | null {
  if (typeof window === "undefined") return null;
  purgeLegacy();
  const email = localStorage.getItem(KEY);
  const exp = Number(localStorage.getItem(EXPIRY_KEY) ?? 0);
  if (!email) return null;
  if (!exp || Date.now() > exp) {
    clearCredentials();
    return null;
  }
  return { email };
}

export function clearCredentials() {
  if (typeof window === "undefined") return;
  purgeLegacy();
  localStorage.removeItem(KEY);
  localStorage.removeItem(EXPIRY_KEY);
}

/** Estende o prazo da preferência após um acesso bem-sucedido. */
export function touchCredentials() {
  if (typeof window === "undefined") return;
  if (!localStorage.getItem(KEY)) return;
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + MAX_AGE_MS));
}

export function hasSavedLogin(): boolean {
  return loadLogin() !== null;
}
