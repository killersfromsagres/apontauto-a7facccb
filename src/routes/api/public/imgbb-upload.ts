import { createFileRoute } from "@tanstack/react-router";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".webp"];

/** Remove diretórios, caracteres de controle e mantém apenas um nome simples. */
function sanitizeName(name: string): string {
  return name
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[^.]+$/, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, 100);
}

function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_EXT.some((ext) => lower.endsWith(ext));
}

/** Confere os magic bytes de JPEG, PNG e WEBP. */
function looksLikeImage(head: Uint8Array): boolean {
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return true; // JPEG
  if (
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47
  )
    return true; // PNG
  const ascii = String.fromCharCode(...Array.from(head.subarray(0, 12)));
  return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
}


/**
 * Proxy de upload de imagens para o ImgBB.
 * Mantém a IMGBB_API_KEY no servidor (nunca exposta ao browser).
 *
 * Enviado como multipart/form-data com o campo `image` (Blob/File).
 * Retorna `{ url, display_url, delete_url }` do ImgBB.
 */
export const Route = createFileRoute("/api/public/imgbb-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.IMGBB_API_KEY;
        if (!key) {
          return Response.json(
            { error: "IMGBB_API_KEY não configurada" },
            { status: 500 },
          );
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json({ error: "Formulário inválido" }, { status: 400 });
        }

        const file = form.get("image");
        if (!(file instanceof Blob)) {
          return Response.json({ error: "Campo image ausente" }, { status: 400 });
        }
        if (file.size === 0) {
          return Response.json({ error: "Imagem vazia" }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
          return Response.json({ error: "Imagem excede 15MB" }, { status: 413 });
        }
        const mime = (file.type || "").toLowerCase().split(";")[0];
        if (!ALLOWED_MIME.has(mime)) {
          return Response.json(
            { error: "Tipo de arquivo não permitido. Envie JPG, PNG ou WEBP." },
            { status: 415 },
          );
        }

        const rawName =
          typeof (file as File).name === "string" ? (file as File).name : "";
        const providedName = form.get("name");
        const baseName = sanitizeName(
          typeof providedName === "string" && providedName.trim()
            ? providedName
            : rawName,
        );
        if (rawName && !hasAllowedExtension(rawName)) {
          return Response.json(
            { error: "Extensão de arquivo não permitida." },
            { status: 415 },
          );
        }
        // Assinatura binária precisa bater com o MIME declarado.
        const buf = await file.arrayBuffer();
        if (!looksLikeImage(new Uint8Array(buf.slice(0, 16)))) {
          return Response.json(
            { error: "Conteúdo do arquivo não é uma imagem válida." },
            { status: 415 },
          );
        }
        const b64 = arrayBufferToBase64(buf);

        const upstream = new FormData();
        upstream.append("image", b64);
        if (baseName) upstream.append("name", baseName);


        let res: Response;
        try {
          res = await fetch(
            `https://api.imgbb.com/1/upload?key=${encodeURIComponent(key)}`,
            { method: "POST", body: upstream },
          );
        } catch (e: any) {
          return Response.json(
            { error: "Falha ao contactar ImgBB", detail: e?.message ?? String(e) },
            { status: 502 },
          );
        }

        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json?.success) {
          return Response.json(
            {
              error: json?.error?.message ?? `ImgBB erro ${res.status}`,
            },
            { status: 502 },
          );
        }

        return Response.json({
          url: json.data.url as string,
          display_url: json.data.display_url as string,
          delete_url: json.data.delete_url as string,
          thumb: json.data?.thumb?.url ?? null,
        });
      },
    },
  },
});

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)),
    );
  }
  // btoa está disponível no runtime worker
  return btoa(bin);
}
