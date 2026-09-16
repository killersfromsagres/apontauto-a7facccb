import { supabase } from "@/integrations/supabase/client";
import { ASSIGNABLE_MENU_KEYS, type MenuKey } from "@/lib/permission-catalog";

export type AdminRole = "admin" | "user";

export type AdminAppUser = {
  id: string;
  login: string;
  email: string;
  fullName: string | null;
  role: AdminRole;
  banned: boolean;
  allowedMenus: string[] | null;
  createdAt: string;
};

export type CreateAdminUserInput = {
  login: string;
  password: string;
  fullName?: string;
  role: AdminRole;
  allowedMenus: MenuKey[];
};

const LOGIN_RE = /^[a-z0-9._-]{3,30}$/;
const GENERIC_ERROR = "Não foi possível consultar os usuários no Supabase.";
const EXPIRED_ERROR = "Sessão expirada. Entre novamente.";

function functionsEndpoint(): string {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) throw new Error(GENERIC_ERROR);
  return `${url.replace(/\/+$/, "")}/functions/v1/admin-user-management`;
}

function publishableKey(): string {
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!key) throw new Error(GENERIC_ERROR);
  return key;
}

async function currentAccessToken(forceRefresh = false): Promise<string> {
  if (forceRefresh) {
    const refreshed = await supabase.auth.refreshSession();
    const token = refreshed.data.session?.access_token ?? null;
    if (refreshed.error || !token) throw new Error(EXPIRED_ERROR);
    return token;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(EXPIRED_ERROR);
  const token = data.session?.access_token ?? null;
  if (token) return token;
  return currentAccessToken(true);
}

type EdgeResponse = Record<string, unknown> & { error?: string; message?: string };

async function requestOnce(
  body: Record<string, unknown>,
  token: string,
): Promise<{ status: number; json: EdgeResponse | null }> {
  const response = await fetch(functionsEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: publishableKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let json: EdgeResponse | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") json = parsed as EdgeResponse;
  } catch {
    json = null;
  }

  return { status: response.status, json };
}

/** Chama a Edge Function administrativa diretamente com o JWT da sessão atual. */
export async function callAdminUserManagement(
  body: Record<string, unknown>,
): Promise<EdgeResponse> {
  let token = await currentAccessToken();
  let result = await requestOnce(body, token);

  if (result.status === 401) {
    token = await currentAccessToken(true);
    result = await requestOnce(body, token);
    if (result.status === 401) throw new Error(EXPIRED_ERROR);
  }

  if (result.json === null) {
    // Resposta não-JSON (ex.: HTML de erro de infraestrutura) nunca vaza para a UI.
    throw new Error(GENERIC_ERROR);
  }

  if (result.status === 403) {
    throw new Error(result.json.error ?? "Apenas administradores podem executar esta ação.");
  }

  if (result.status < 200 || result.status >= 300) {
    throw new Error(result.json.error ?? result.json.message ?? GENERIC_ERROR);
  }

  return result.json;
}

export async function listUsers(): Promise<AdminAppUser[]> {
  const json = await callAdminUserManagement({ action: "list" });
  const users = json.users;
  if (!Array.isArray(users)) throw new Error(GENERIC_ERROR);
  return users as AdminAppUser[];
}

function sanitizeMenus(raw: readonly string[]): MenuKey[] {
  return Array.from(
    new Set(
      raw.filter((key): key is MenuKey =>
        (ASSIGNABLE_MENU_KEYS as readonly string[]).includes(key),
      ),
    ),
  );
}

export async function createUser(input: CreateAdminUserInput): Promise<EdgeResponse> {
  const login = input.login.trim().toLowerCase();
  if (!LOGIN_RE.test(login)) {
    throw new Error("Login deve ter 3-30 caracteres (letras minúsculas, números, . _ -).");
  }
  if (input.password.length < 6) {
    throw new Error("A senha deve ter pelo menos 6 caracteres.");
  }
  const role: AdminRole = input.role === "admin" ? "admin" : "user";
  return callAdminUserManagement({
    action: "create",
    login,
    password: input.password,
    fullName: input.fullName?.trim() || undefined,
    role,
    allowedMenus: role === "admin" ? [] : sanitizeMenus(input.allowedMenus),
  });
}

export async function deleteUser(userId: string): Promise<void> {
  await callAdminUserManagement({ action: "delete", userId });
}

export async function setUserBannedState(userId: string, banned: boolean): Promise<void> {
  await callAdminUserManagement({ action: "setBanned", userId, banned });
}

export async function setUserRoleState(userId: string, role: AdminRole): Promise<void> {
  await callAdminUserManagement({ action: "setRole", userId, role });
}

export async function setUserMenus(userId: string, allowedMenus: string[]): Promise<void> {
  await callAdminUserManagement({
    action: "setMenus",
    userId,
    allowedMenus: sanitizeMenus(allowedMenus),
  });
}

export async function resetUserPassword(userId: string, password: string): Promise<void> {
  if (password.length < 6) throw new Error("A nova senha deve ter pelo menos 6 caracteres.");
  await callAdminUserManagement({ action: "resetPassword", userId, password });
}

export async function provisionEncarregados(): Promise<EdgeResponse> {
  return callAdminUserManagement({ action: "provisionEncarregados" });
}

export async function provisionChamados(): Promise<EdgeResponse> {
  return callAdminUserManagement({ action: "provisionChamados" });
}

export async function provisionScoped(input: {
  login: string;
  password: string;
  fullName?: string;
  modules: string[];
}): Promise<EdgeResponse> {
  return callAdminUserManagement({
    action: "provisionScoped",
    login: input.login.trim().toLowerCase(),
    password: input.password,
    fullName: input.fullName,
    modules: input.modules,
  });
}
