import { createFileRoute } from "@tanstack/react-router";

function getPublicSupabaseConfig() {
  const url =
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL;
  const publishableKey =
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;

  return { url, publishableKey };
}

/**
 * Proxy compatível com os fluxos legados de upload.
 *
 * Nenhuma chave administrativa ou chave do ImgBB fica neste servidor, no
 * bundle do navegador ou no GitHub. A validação, autorização, rate-limit e o
 * upload são executados pela Edge Function `imgbb-upload` do Supabase ativo.
 */
export const Route = createFileRoute("/api/imgbb-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        if (!authorization.startsWith("Bearer ")) {
          return Response.json({ error: "Sessão inválida." }, { status: 401 });
        }

        const { url, publishableKey } = getPublicSupabaseConfig();
        if (!url || !publishableKey) {
          return Response.json(
            { error: "Backend de imagens indisponível: Supabase público não configurado." },
            { status: 503 },
          );
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json({ error: "Formulário inválido." }, { status: 400 });
        }

        let upstream: Response;
        try {
          upstream = await fetch(`${url}/functions/v1/imgbb-upload`, {
            method: "POST",
            headers: {
              Authorization: authorization,
              apikey: publishableKey,
            },
            body: form,
          });
        } catch {
          return Response.json(
            { error: "Serviço de imagens temporariamente indisponível." },
            { status: 502 },
          );
        }

        const body = await upstream.text();
        return new Response(body, {
          status: upstream.status,
          headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json" },
        });
      },
    },
  },
});