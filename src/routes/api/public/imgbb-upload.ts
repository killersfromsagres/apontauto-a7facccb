import { createFileRoute } from "@tanstack/react-router";

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
        if (file.size > 15 * 1024 * 1024) {
          return Response.json({ error: "Imagem excede 15MB" }, { status: 413 });
        }

        // ImgBB aceita base64 no campo image via multipart.
        const buf = await file.arrayBuffer();
        const b64 = arrayBufferToBase64(buf);

        const upstream = new FormData();
        upstream.append("image", b64);
        const name = form.get("name");
        if (typeof name === "string" && name.trim()) {
          upstream.append("name", name.trim().slice(0, 120));
        }

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
