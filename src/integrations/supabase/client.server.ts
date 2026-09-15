// Server-side Supabase client with privileged key - bypasses RLS.
// Use this for admin operations in server functions and server routes only.
// For user-authenticated queries (with RLS), use the auth middleware instead.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function projectRefFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    const suffix = ".supabase.co";
    return hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : null;
  } catch {
    return null;
  }
}

function resolvePrivilegedKey(): string | undefined {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.SUPABASE_SECRET_KEY) return process.env.SUPABASE_SECRET_KEY;

  const secretKeys = process.env.SUPABASE_SECRET_KEYS;
  if (!secretKeys) return undefined;

  try {
    const parsed = JSON.parse(secretKeys) as Record<string, unknown>;
    const preferred = parsed.default ?? parsed.internal ?? Object.values(parsed)[0];
    return typeof preferred === "string" && preferred ? preferred : undefined;
  } catch {
    console.error("[Supabase] SUPABASE_SECRET_KEYS is not valid JSON.");
    return undefined;
  }
}

function createSupabaseAdminClient() {
  // A URL usada pelo admin client deve ser a mesma usada pelo frontend autenticado.
  // Isso impede que uma variável server-side antiga direcione operações de usuários
  // para outro projeto Supabase enquanto o navegador autentica no projeto atual.
  const viteUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const viteProjectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;
  const SUPABASE_URL = viteUrl || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_PROJECT_ID =
    viteProjectId || process.env.VITE_SUPABASE_PROJECT_ID || process.env.SUPABASE_PROJECT_ID;
  const SUPABASE_PRIVILEGED_KEY = resolvePrivilegedKey();

  if (!SUPABASE_URL || !SUPABASE_PRIVILEGED_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["VITE_SUPABASE_URL/SUPABASE_URL"] : []),
      ...(!SUPABASE_PRIVILEGED_KEY
        ? ["SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY/SUPABASE_SECRET_KEYS"]
        : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Connect the active Supabase project in the server environment.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  if (SUPABASE_PROJECT_ID) {
    const resolvedProjectId = projectRefFromUrl(SUPABASE_URL);
    if (resolvedProjectId && resolvedProjectId !== SUPABASE_PROJECT_ID) {
      const message = `Supabase project mismatch: active URL points to ${resolvedProjectId}, expected ${SUPABASE_PROJECT_ID}.`;
      console.error(`[Supabase] ${message}`);
      throw new Error(message);
    }
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PRIVILEGED_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PRIVILEGED_KEY),
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

// Server-side Supabase client with privileged key - bypasses RLS.
// SECURITY: Only use this for trusted server-side operations, never expose to client code.
// Load inside server handlers: const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
// Top-level import is safe only in other .server.ts modules - route files and *.functions.ts ship to the client bundle.
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
