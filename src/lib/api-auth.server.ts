/**
 * Validação de sessão para rotas HTTP (`src/routes/api/**`).
 *
 * As rotas sob `/api/public/*` não passam pela proteção do site publicado,
 * portanto cada handler precisa validar o portador (bearer) por conta própria.
 * Este helper é server-only: importe sempre com `await import()` dentro do
 * handler para não vazar para o bundle do browser.
 */
import { createClient } from "@supabase/supabase-js";

export type ApiCaller = { userId: string; email: string | null };

/**
 * Retorna o usuário autenticado a partir do header `Authorization: Bearer`.
 * Retorna `null` quando não há token válido.
 */
export async function getRequestUser(request: Request): Promise<ApiCaller | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  if (!token) return null;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id, email: data.user.email ?? null };
}

/** Resposta padrão 401 para chamadas sem sessão válida. */
export function unauthorized(): Response {
  return Response.json({ error: "Não autorizado" }, { status: 401 });
}
