/**
 * Validação de sessão para rotas HTTP (`src/routes/api/**`).
 *
 * As rotas sob `/api/public/*` não passam pela proteção do site publicado,
 * portanto cada handler precisa validar o portador (bearer) por conta própria.
 * Este helper é server-only: importe sempre com `await import()` dentro do
 * handler para não vazar para o bundle do browser.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ApiCaller = { userId: string; email: string | null };

function bearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

/**
 * Credenciais públicas do backend. Em alguns provedores (ex.: Vercel) apenas as
 * variáveis `VITE_*` chegam ao runtime; sem esse fallback o servidor devolvia
 * 401 para uploads perfeitamente válidos — e o app derrubava a sessão do
 * usuário achando que o token tinha expirado.
 */
function authConfig(): { url: string; key: string } | null {
  // Prioridade para variáveis de ambiente do Worker, depois fallback para VITE_* injetadas
  const url =
    process.env.SUPABASE_URL || 
    process.env.VITE_SUPABASE_URL || 
    (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SUPABASE_URL : null) ||
    "https://uthidybbrziwvktknryr.supabase.co"; // Fallback para Lovable Cloud
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY : null) ||
    "sb_publishable_4K0A758AP4Cr4mi6VcWwUg_rLMZi_VD"; // Fallback para Lovable Cloud
  if (!url || !key) return null;
  return { url, key };
}

/** `true` quando o servidor tem como validar sessões. */
export function hasAuthConfig(): boolean {
  return authConfig() !== null;
}

function anonClient(token?: string): SupabaseClient | null {
  const config = authConfig();
  if (!config) return null;
  const { url, key } = config;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        if (token) h.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

/**
 * Retorna o usuário autenticado a partir do header `Authorization: Bearer`.
 * Retorna `null` quando não há token válido.
 */
export async function getRequestUser(request: Request): Promise<ApiCaller | null> {
  const token = bearer(request);
  if (!token) return null;
  const client = anonClient();
  if (!client) return null;

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id, email: data.user.email ?? null };
}

/**
 * Cliente Supabase agindo como o próprio usuário da requisição (RLS aplicada).
 * Use para checar permissões de módulo com `can_access_module`.
 */
export function getRequestClient(request: Request): SupabaseClient | null {
  const token = bearer(request);
  if (!token) return null;
  return anonClient(token);
}

/** Verifica se o chamador possui a permissão do módulo informado. */
export async function callerCanAccessModule(
  request: Request,
  moduleKey: string,
  action = "read",
): Promise<boolean> {
  const client = getRequestClient(request);
  if (!client) return false;
  const { data, error } = await client.rpc("can_access_module", {
    module_key: moduleKey,
    required_action: action,
  });
  if (error) return false;
  return Boolean(data);
}

/** Resposta padrão 401 para chamadas sem sessão válida. */
export function unauthorized(): Response {
  return Response.json({ error: "Não autorizado", code: "session_invalid" }, { status: 401 });
}

/**
 * 503 para indisponibilidade de configuração do servidor. Usar isto em vez de
 * 401 evita que o cliente interprete falha de infraestrutura como sessão
 * expirada e desconecte o usuário no meio de um envio.
 */
export function serviceUnavailable(detail = "Serviço temporariamente indisponível."): Response {
  return Response.json({ error: detail, code: "server_config" }, { status: 503 });
}

/** Resposta padrão 403 para chamadas sem permissão no módulo. */
export function forbidden(moduleKey?: string, action = "create"): Response {
  return Response.json(
    {
      error: moduleKey
        ? `Sem permissão para "${moduleKey}" (${action}). Peça ao administrador para liberar este módulo em Configurações → Usuários.`
        : "Sem permissão para este módulo",
    },
    { status: 403 },
  );
}
