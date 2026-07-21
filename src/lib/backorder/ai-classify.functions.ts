// Reclassificação em lote de OS de backorder usando Lovable AI Gateway.
// Recebe uma lista de OS abertas e devolve a categoria (equipe) inferida
// pelo modelo a partir da descrição, ativo e solicitante.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CATEGORIAS = [
  "Chaveiro",
  "Civil",
  "Refrigeração",
  "Elétrica",
  "Hidráulica",
  "Pintura",
  "Gerenciamento",
  "Outros",
] as const;

const InputSchema = z.object({
  items: z
    .array(
      z.object({
        os: z.string().min(1),
        descricao: z.string().default(""),
        ativo: z.string().default(""),
        solicitante: z.string().default(""),
        predio: z.string().default(""),
      }),
    )
    .min(1)
    .max(400),
});

interface AiResult {
  os: string;
  categoria: (typeof CATEGORIAS)[number];
  confianca: "alta" | "media" | "baixa";
  justificativa?: string;
}

const SYSTEM_PROMPT = `Você é um agente especialista em manutenção predial que classifica ordens de serviço (OS) corretivas para a equipe responsável.

Categorias permitidas (use EXATAMENTE um destes valores no campo "categoria"):
- "Chaveiro": fechaduras, chaves, cadeados, cilindros, maçanetas, trincos.
- "Civil": alvenaria, gesso, forro, piso, telha, esquadria, marcenaria, mobiliário, quadros, dispensers, suporte, revestimento (SEM pintura).
- "Refrigeração": ar-condicionado, split, chiller, câmara fria, geladeira, freezer, bebedouro, exaustor, climatização.
- "Elétrica": tomada, disjuntor, lâmpada, luminária, quadro elétrico, cabo, interruptor, reator.
- "Hidráulica": vazamento, torneira, válvula, ralo, esgoto, bomba, caixa d'água, sifão, entupimento.
- "Pintura": pintura, repintura, tinta, verniz, textura, demarcação/sinalização de piso.
- "Gerenciamento": tarefas administrativas, gestão, cadastro, planilhas, relatórios.
- "Outros": SOMENTE quando a descrição é genuinamente ambígua ou insuficiente.

Regras:
1. Pintura tem prioridade sobre Civil quando ambos se aplicam.
2. Prefira uma categoria específica em vez de "Outros" sempre que houver qualquer pista.
3. Considere descrição, código do ativo (ex: SPLIT-01 → Refrigeração) e solicitante.
4. Responda ESTRITAMENTE em JSON válido no formato solicitado, sem comentários.`;

export const classifyBackorderWithAi = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<{ results: AiResult[] }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurado.");

    const BATCH_SIZE = 40;
    const results: AiResult[] = [];

    for (let i = 0; i < data.items.length; i += BATCH_SIZE) {
      const batch = data.items.slice(i, i + BATCH_SIZE);
      const userPayload = batch.map((it) => ({
        os: it.os,
        descricao: it.descricao?.slice(0, 400) ?? "",
        ativo: it.ativo,
        solicitante: it.solicitante,
        predio: it.predio,
      }));

      const body = {
        model: "google/gemini-3.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content:
              `Classifique cada OS abaixo. Responda em JSON estrito no formato:\n` +
              `{ "results": [ { "os": "...", "categoria": "Chaveiro|Civil|Refrigeração|Elétrica|Hidráulica|Pintura|Gerenciamento|Outros", "confianca": "alta|media|baixa", "justificativa": "curta" } ] }\n\n` +
              `OSs:\n${JSON.stringify(userPayload, null, 2)}`,
          },
        ],
        response_format: { type: "json_object" },
      };

      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
        },
        body: JSON.stringify(body),
      });

      if (resp.status === 429) throw new Error("Limite de requisições atingido. Aguarde alguns instantes.");
      if (resp.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Falha na IA (${resp.status}): ${txt.slice(0, 300)}`);
      }

      const json = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content ?? "";
      let parsed: { results?: AiResult[] } = {};
      try {
        parsed = JSON.parse(content);
      } catch {
        // Tenta extrair bloco JSON
        const m = content.match(/\{[\s\S]*\}/);
        if (m) {
          try {
            parsed = JSON.parse(m[0]);
          } catch {
            /* ignore */
          }
        }
      }
      const validos = (parsed.results ?? []).filter(
        (r) => r && typeof r.os === "string" && (CATEGORIAS as readonly string[]).includes(r.categoria),
      );
      for (const v of validos) results.push(v);
    }

    return { results };
  });
