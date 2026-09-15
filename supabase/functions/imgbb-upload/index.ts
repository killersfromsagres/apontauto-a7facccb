import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, ...extraHeaders, "Content-Type": "application/json" },
  });
}

function looksLikeImage(head: Uint8Array) {
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return true;
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return true;
  const ascii = String.fromCharCode(...Array.from(head.subarray(0, 12)));
  return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
}

async function sha256Hex(buf: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sanitizeName(name: string) {
  return name
    .split(/[\\/]/).pop()!
    .replace(/\.[^.]+$/, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, 100);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "Backend de imagens não configurado." }, 503);

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Sessão inválida." }, 401);

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return json({ error: "Sessão expirada. Entre novamente." }, 401);

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "Formulário inválido." }, 400); }

  const moduleKey = String(form.get("module") ?? "").trim().slice(0, 80);
  if (!moduleKey) return json({ error: "Módulo de origem obrigatório." }, 400);

  const { data: canAccess, error: accessError } = await caller.rpc("user_can_access", { _module: moduleKey });
  if (accessError) return json({ error: accessError.message }, 500);
  if (!canAccess) return json({ error: "Sem permissão para enviar imagem neste módulo." }, 403);

  const file = form.get("image");
  if (!(file instanceof Blob)) return json({ error: "Campo image ausente." }, 400);
  if (file.size === 0) return json({ error: "Imagem vazia." }, 400);
  if (file.size > MAX_BYTES) return json({ error: "Imagem excede 12 MB." }, 413);

  const mime = (file.type || "").toLowerCase().split(";")[0];
  if (!ALLOWED_MIME.has(mime)) return json({ error: "Tipo não permitido. Use JPEG, PNG ou WebP." }, 415);

  const buf = await file.arrayBuffer();
  if (!looksLikeImage(new Uint8Array(buf.slice(0, 16)))) return json({ error: "Conteúdo do arquivo não é uma imagem válida." }, 415);
  const hash = await sha256Hex(buf);

  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await admin.from("image_uploads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userData.user.id)
    .gte("created_at", since);
  if ((count ?? 0) >= 150) {
    return json({ error: "Muitos envios em pouco tempo. Tente novamente em alguns minutos." }, 429, { "Retry-After": "600" });
  }

  const { data: secretData, error: secretError } = await admin.rpc("get_backend_secret", { _name: "IMGBB_API_KEY" });
  if (secretError || typeof secretData !== "string" || !secretData) return json({ error: "Serviço de imagens não configurado." }, 503);

  const rawName = typeof (file as File).name === "string" ? (file as File).name : "imagem";
  const requestedName = typeof form.get("name") === "string" ? String(form.get("name")) : rawName;
  const upstream = new FormData();
  upstream.append("image", new Blob([buf], { type: mime }), rawName || "imagem");
  const safeName = sanitizeName(requestedName);
  if (safeName) upstream.append("name", safeName);

  let response: Response;
  try {
    response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(secretData)}`, { method: "POST", body: upstream });
  } catch {
    return json({ error: "Falha temporária ao contactar o serviço de imagens." }, 502);
  }

  const upstreamJson = await response.json().catch(() => null) as any;
  const finalUrl = upstreamJson?.data?.url ?? upstreamJson?.data?.display_url ?? null;
  if (!response.ok || !upstreamJson?.success || !finalUrl) {
    return json({ error: upstreamJson?.error?.message ?? "O serviço de imagens não concluiu o upload." }, response.status >= 400 ? response.status : 502);
  }

  const entityType = typeof form.get("entity_type") === "string" ? String(form.get("entity_type")).slice(0, 60) : null;
  const entityId = typeof form.get("entity_id") === "string" ? String(form.get("entity_id")).slice(0, 120) : null;
  const { error: auditError } = await admin.from("image_uploads").insert({
    user_id: userData.user.id,
    module_key: moduleKey,
    entity_type: entityType,
    entity_id: entityId,
    sha256: hash,
    size_bytes: file.size,
    mime_type: mime,
    url: finalUrl,
    delete_url: null,
  });
  if (auditError) console.error("image_uploads audit failed", auditError.message);

  return json({ url: finalUrl, hash });
});