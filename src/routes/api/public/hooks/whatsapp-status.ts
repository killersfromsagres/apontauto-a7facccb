import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook de status da WhatsApp Cloud API (item 11.3).
 * Atualiza enviado/entregue/lido/falha em `agua_whatsapp_envios`.
 * Rota pública por exigência da Meta — protegida por verify token + assinatura.
 */
export const Route = createFileRoute("/api/public/hooks/whatsapp-status")({
  server: {
    handlers: {
      // Handshake de verificação da Meta.
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        const esperado = process.env.WHATSAPP_VERIFY_TOKEN;
        if (!esperado || mode !== "subscribe" || token !== esperado) {
          return new Response("forbidden", { status: 403 });
        }
        return new Response(challenge, { status: 200 });
      },

      POST: async ({ request }) => {
        const appSecret = process.env.WHATSAPP_APP_SECRET;
        const raw = await request.text();

        if (appSecret) {
          const assinatura = (request.headers.get("x-hub-signature-256") ?? "").replace(
            "sha256=",
            "",
          );
          const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(appSecret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
          );
          const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
          const esperado = Array.from(new Uint8Array(mac))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          if (assinatura !== esperado) return new Response("invalid signature", { status: 401 });
        }

        let payload: any;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("bad request", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as any;
        const agora = new Date().toISOString();

        for (const entry of payload?.entry ?? []) {
          for (const change of entry?.changes ?? []) {
            for (const st of change?.value?.statuses ?? []) {
              const id = st?.id;
              if (!id) continue;
              const patch: Record<string, unknown> = {};
              if (st.status === "sent") patch.enviado_em = agora;
              if (st.status === "delivered") patch.entregue_em = agora;
              if (st.status === "read") patch.lido_em = agora;
              if (st.status === "failed") {
                patch.ultimo_erro = String(st?.errors?.[0]?.title ?? "falha").slice(0, 300);
              }
              patch.status = st.status === "failed" ? "falha" : String(st.status);
              await admin
                .from("agua_whatsapp_envios")
                .update(patch)
                .eq("provider_message_id", id);
            }
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
