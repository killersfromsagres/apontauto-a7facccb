import { createFileRoute } from "@tanstack/react-router";

/**
 * Modo avançado opcional (item 11.3): envio oficial pela WhatsApp Business
 * Platform Cloud API da Meta.
 *
 * Regras aplicadas aqui:
 * - executa somente no servidor; token e phone number ID vivem em secrets;
 * - nunca usa API não oficial;
 * - desativado enquanto o administrador não habilitar E validar a configuração;
 * - fila/histórico em `agua_whatsapp_envios` com idempotência por chave;
 * - retry apenas para falhas temporárias (429/5xx/rede);
 * - limite diário de disparos configurável;
 * - imagens enviadas por URL pública (ImgBB), nunca com o token exposto.
 */
export const Route = createFileRoute("/api/whatsapp-enviar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getRequestUser, getRequestClient, unauthorized, forbidden } = await import(
          "@/lib/api-auth.server"
        );

        const caller = await getRequestUser(request);
        if (!caller) return unauthorized();

        const client = getRequestClient(request);
        if (!client) return unauthorized();

        // Só gestores do módulo podem disparar pela API oficial.
        const { data: gestor } = await client.rpc("agua_is_gestor");
        if (!gestor) return forbidden();

        let body: {
          destinatario?: string;
          mensagem?: string;
          imagens?: string[];
          escopoTipo?: string;
          escopoId?: string | null;
          idempotencyKey?: string;
          teste?: boolean;
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "JSON inválido" }, { status: 400 });
        }

        const destinatario = String(body.destinatario ?? "").replace(/\D/g, "");
        const mensagem = String(body.mensagem ?? "").slice(0, 4000);
        const imagens = (body.imagens ?? [])
          .filter((u) => typeof u === "string" && /^https:\/\//.test(u))
          .slice(0, 10);
        if (destinatario.length < 10 || destinatario.length > 15) {
          return Response.json({ error: "Destinatário inválido" }, { status: 400 });
        }
        if (!mensagem.trim()) {
          return Response.json({ error: "Mensagem vazia" }, { status: 400 });
        }

        // Configuração administrativa (habilitado + validado) mora em app_settings.
        const { data: settingsRow } = await client
          .from("app_settings")
          .select("data")
          .limit(1)
          .maybeSingle();
        const cfg = ((settingsRow?.data as Record<string, any>)?.aguaWhatsapp?.cloud ?? {}) as {
          habilitado?: boolean;
          validado?: boolean;
          sandbox?: boolean;
          destinatarios?: string[];
          limiteDiario?: number;
        };
        if (!cfg.habilitado || !cfg.validado) {
          return Response.json(
            { error: "Envio oficial desativado até a configuração ser validada." },
            { status: 409 },
          );
        }
        const permitidos = (cfg.destinatarios ?? []).map((n) => String(n).replace(/\D/g, ""));
        if (permitidos.length && !permitidos.includes(destinatario)) {
          return Response.json({ error: "Destinatário não configurado" }, { status: 403 });
        }

        const token = process.env.WHATSAPP_TOKEN;
        const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        if (!token || !phoneId) {
          return Response.json(
            { error: "Credenciais da Cloud API não configuradas." },
            { status: 503 },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as any;

        // Limite de disparo diário.
        const inicioDia = new Date();
        inicioDia.setHours(0, 0, 0, 0);
        const { count } = await admin
          .from("agua_whatsapp_envios")
          .select("id", { count: "exact", head: true })
          .eq("modo", "cloud_api")
          .gte("criado_em", inicioDia.toISOString());
        if ((count ?? 0) >= (cfg.limiteDiario ?? 50)) {
          return Response.json({ error: "Limite diário de disparos atingido." }, { status: 429 });
        }

        const mascarado = `${destinatario.slice(0, 2)}•••••${destinatario.slice(-2)}`;
        const hashBuf = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(destinatario),
        );
        const hash = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        // Idempotência: mesma chave não dispara duas vezes.
        const idem = String(body.idempotencyKey ?? "").slice(0, 120) || null;
        if (idem) {
          const { data: existente } = await admin
            .from("agua_whatsapp_envios")
            .select("id, status, provider_message_id")
            .eq("modo", "cloud_api")
            .eq("escopo_id", idem)
            .maybeSingle();
          if (existente) return Response.json({ ...existente, reaproveitado: true });
        }

        const { data: fila } = await admin
          .from("agua_whatsapp_envios")
          .insert({
            escopo_tipo: body.escopoTipo ?? "selecao",
            escopo_id: idem ?? body.escopoId ?? null,
            modo: "cloud_api",
            destinatario_mascarado: mascarado,
            destinatario_hash: hash,
            mensagem_versao: "v1",
            status: "na_fila",
            qtd_fotos: imagens.length,
            iniciado_por: caller.userId,
          })
          .select("id")
          .single();
        const filaId = (fila as { id: string } | null)?.id ?? null;

        if (body.teste || cfg.sandbox) {
          // Botão de teste / ambiente sandbox: valida o fluxo sem disparo real.
          if (filaId) {
            await admin
              .from("agua_whatsapp_envios")
              .update({ status: "teste_ok", ultimo_erro: null })
              .eq("id", filaId);
          }
          return Response.json({ id: filaId, status: "teste_ok", sandbox: true });
        }

        const endpoint = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
        const payloads: Record<string, unknown>[] = [
          { messaging_product: "whatsapp", to: destinatario, type: "text", text: { body: mensagem } },
          ...imagens.map((link) => ({
            messaging_product: "whatsapp",
            to: destinatario,
            type: "image",
            image: { link },
          })),
        ];

        let providerId: string | null = null;
        let tentativas = 0;

        for (const payload of payloads) {
          let ok = false;
          for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
            tentativas += 1;
            try {
              const res = await fetch(endpoint, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
              });
              if (res.ok) {
                const json = (await res.json()) as { messages?: { id: string }[] };
                providerId = providerId ?? json.messages?.[0]?.id ?? null;
                ok = true;
                break;
              }
              // Retry apenas para falhas temporárias.
              if (res.status !== 429 && res.status < 500) {
                const detalhe = await res.text();
                if (filaId) {
                  await admin
                    .from("agua_whatsapp_envios")
                    .update({
                      status: "falha",
                      tentativas,
                      ultimo_erro: detalhe.slice(0, 300),
                    })
                    .eq("id", filaId);
                }
                return Response.json({ error: "Falha no envio oficial." }, { status: 502 });
              }
            } catch {
              /* falha de rede: tenta novamente */
            }
            await new Promise((r) => setTimeout(r, 400 * tentativa));
          }
          if (!ok) {
            if (filaId) {
              await admin
                .from("agua_whatsapp_envios")
                .update({ status: "falha", tentativas, ultimo_erro: "temporaria" })
                .eq("id", filaId);
            }
            return Response.json({ error: "Serviço indisponível, tente novamente." }, { status: 503 });
          }
        }

        if (filaId) {
          await admin
            .from("agua_whatsapp_envios")
            .update({
              status: "enviado",
              enviado_em: new Date().toISOString(),
              provider_message_id: providerId,
              tentativas,
            })
            .eq("id", filaId);
        }
        return Response.json({ id: filaId, status: "enviado" });
      },
    },
  },
});
