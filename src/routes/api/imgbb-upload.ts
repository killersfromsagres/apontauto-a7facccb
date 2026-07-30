import { createFileRoute } from "@tanstack/react-router";

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

function sanitizeName(name: string): string {
  return (
    name
      .split(/[\\/]/)
      .pop()!
      .replace(/\.[^.]+$/, "")
      // eslint-disable-next-line no-control-regex -- remoção intencional de caracteres de controle
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^[-.]+/, "")
      .slice(0, 100)
  );
}

function looksLikeImage(head: Uint8Array): boolean {
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return true; // JPEG
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return true; // PNG
  const ascii = String.fromCharCode(...Array.from(head.subarray(0, 12)));
  return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

/**
 * Proxy autenticado de upload de imagens (evidências) para o ImgBB.
 *
 * Diferenças em relação à rota legada `/api/public/imgbb-upload`:
 * - exige sessão válida **e** permissão de escrita no módulo informado;
 * - `delete_url` nunca é devolvido a usuário comum;
 * - registra hash, tamanho e origem em `image_uploads` para auditoria.
 */
export const Route = createFileRoute("/api/imgbb-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getRequestUser, callerCanAccessModule, unauthorized, forbidden } =
          await import("@/lib/api-auth.server");

        const caller = await getRequestUser(request);
        if (!caller) return unauthorized();

        const key = process.env.IMGBB_API_KEY;
        if (!key) {
          return Response.json({ error: "IMGBB_API_KEY não configurada" }, { status: 500 });
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json({ error: "Formulário inválido" }, { status: 400 });
        }

        const moduleKey = String(form.get("module") ?? "").slice(0, 60);
        if (!moduleKey) {
          return Response.json({ error: "Módulo de origem obrigatório" }, { status: 400 });
        }
        if (!(await callerCanAccessModule(request, moduleKey, "create"))) {
          return forbidden(moduleKey, "create");
        }

        const file = form.get("image");
        if (!(file instanceof Blob)) {
          return Response.json({ error: "Campo image ausente" }, { status: 400 });
        }
        if (file.size === 0) return Response.json({ error: "Imagem vazia" }, { status: 400 });
        if (file.size > MAX_BYTES) {
          return Response.json({ error: "Imagem excede 12MB" }, { status: 413 });
        }
        const mime = (file.type || "").toLowerCase().split(";")[0];
        if (!ALLOWED_MIME.has(mime)) {
          return Response.json(
            { error: "Tipo de arquivo não permitido. Envie JPG, PNG ou WEBP." },
            { status: 415 },
          );
        }

        const buf = await file.arrayBuffer();
        if (!looksLikeImage(new Uint8Array(buf.slice(0, 16)))) {
          return Response.json(
            { error: "Conteúdo do arquivo não é uma imagem válida." },
            { status: 415 },
          );
        }
        const sha256 = await sha256Hex(buf);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { count } = await supabaseAdmin
          .from("image_uploads")
          .select("id", { count: "exact", head: true })
          .eq("user_id", caller.userId)
          .gte("created_at", since);
        if ((count ?? 0) >= 150) {
          return Response.json(
            { error: "Muitos envios em pouco tempo. Tente novamente em alguns minutos." },
            { status: 429, headers: { "Retry-After": "600" } },
          );
        }

        const rawName = typeof (file as File).name === "string" ? (file as File).name : "";
        const provided = form.get("name");
        const baseName = sanitizeName(
          typeof provided === "string" && provided.trim() ? provided : rawName,
        );

        const upstream = new FormData();
        upstream.append("image", arrayBufferToBase64(buf));
        if (baseName) upstream.append("name", baseName);

        let res: Response;
        try {
          res = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(key)}`, {
            method: "POST",
            body: upstream,
          });
        } catch (e: any) {
          return Response.json(
            { error: "Falha ao contactar o serviço de imagens", detail: e?.message ?? String(e) },
            { status: 502 },
          );
        }

        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json?.success) {
          return Response.json(
            { error: json?.error?.message ?? `Serviço de imagens retornou ${res.status}` },
            { status: 502 },
          );
        }

        const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
          _user_id: caller.userId,
          _role: "admin",
        });

        await supabaseAdmin.from("image_uploads").insert({
          user_id: caller.userId,
          module_key: moduleKey,
          entity_type:
            typeof form.get("entity_type") === "string"
              ? String(form.get("entity_type")).slice(0, 60)
              : null,
          entity_id:
            typeof form.get("entity_id") === "string"
              ? String(form.get("entity_id")).slice(0, 120)
              : null,
          sha256,
          size_bytes: file.size,
          mime_type: mime,
          url: json.data.url as string,
          delete_url: (json.data.delete_url as string) ?? null,
        });

        return Response.json({
          url: json.data.url as string,
          display_url: json.data.display_url as string,
          delete_url: isAdmin ? (json.data.delete_url as string) : null,
          thumb: json.data?.thumb?.url ?? null,
          hash: sha256,
        });
      },
    },
  },
});
