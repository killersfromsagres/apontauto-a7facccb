import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { CATEGORIAS, classifyBackorder } from "@/lib/backorder/classify";
import { createFileRoute } from "@tanstack/react-router";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";

const InputSchema = z.object({
  items: z.array(
    z.object({
      os: z.string(),
      descricao: z.string().optional(),
      ativo: z.string().optional(),
      solicitante: z.string().optional(),
      predio: z.string().optional(),
    }),
  ),
});

const AiOutputSchema = z.object({
  results: z.array(
    z.object({
      os: z.string(),
      categoria: z.enum(CATEGORIAS),
      confianca: z.enum(["alta", "media", "baixa"]),
      justificativa: z.string().nullable(),
    }),
  ),
});

type InputItem = z.infer<typeof InputSchema>["items"][number];
type AiResult = z.infer<typeof AiOutputSchema>["results"][number];

const SYSTEM_PROMPT = `Você é um classificador técnico de chamados de manutenção predial.
Classifique cada OS em exatamente uma destas categorias:
- Chaveiro
- Civil
- Refrigeração
- Elétrica
- Hidráulica
- Pintura
- Gerenciamento
- Outros

Critérios principais:
- Chaveiro: fechadura, chave, maçaneta, miolo, porta travada.
- Civil: alvenaria, piso, forro, telhado, parede, infiltração estrutural, obra.
- Refrigeração: ar-condicionado, split, condensadora, evaporadora, climatização, HVAC.
- Elétrica: lâmpada, tomada, disjuntor, energia, quadro elétrico, curto, iluminação.
- Hidráulica: vazamento, torneira, descarga, vaso, pia, ralo, tubulação, água, esgoto.
- Pintura: pintura, tinta, retoque, descascado, parede manchada.
- Gerenciamento: vistoria, orçamento, acompanhamento, planejamento, gestão, fiscalização.
- Outros: somente quando não houver evidência suficiente.

Regras:
1. Pintura tem prioridade sobre Civil quando ambos se aplicam.
2. Prefira uma categoria específica em vez de "Outros" sempre que houver qualquer pista.
3. Considere descrição, código do ativo e solicitante.
4. Responda estritamente no JSON solicitado.`;

function fallbackClassify(items: InputItem[], reason: string): AiResult[] {
  return items.map((item) => ({
    os: item.os,
    categoria: classifyBackorder({ descricao: item.descricao, servico: item.ativo, categoria: item.predio }),
    confianca: "media",
    justificativa: `Classificação por regras locais: ${reason}`,
  }));
}

function normalizeResults(items: InputItem[], raw: unknown): AiResult[] {
  const knownOs = new Set(items.map((item) => item.os));
  const parsed = AiOutputSchema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.results.filter((result) => knownOs.has(result.os));
}

function parseJsonFallback(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function classifyItems(items: InputItem[]) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return fallbackClassify(items, "IA indisponível temporariamente");

  const gateway = createLovableAiGatewayProvider(apiKey);
  const model = gateway("google/gemini-3.5-flash");
  const results: AiResult[] = [];
  const batchSize = 40;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const payload = batch.map((item) => ({
      os: item.os,
      descricao: item.descricao,
      ativo: item.ativo,
      solicitante: item.solicitante,
      predio: item.predio,
    }));

    try {
      const { output } = await generateText({
        model,
        system: SYSTEM_PROMPT,
        output: Output.object({ schema: AiOutputSchema }),
        prompt:
          `Classifique cada OS abaixo. Retorne uma classificação por OS, em JSON válido, no formato solicitado pelo schema.\n\n` +
          `OSs:\n${JSON.stringify(payload, null, 2)}`,
      });
      const valid = normalizeResults(batch, output);
      results.push(...(valid.length > 0 ? valid : fallbackClassify(batch, "retorno vazio da IA")));
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        const parsed = parseJsonFallback(error.text ?? "");
        const valid = normalizeResults(batch, parsed);
        results.push(...(valid.length > 0 ? valid : fallbackClassify(batch, "retorno inválido da IA")));
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("429") || message.toLowerCase().includes("rate")) {
        throw new Error("Limite de requisições atingido. Aguarde alguns instantes.");
      }
      if (message.includes("402") || message.toLowerCase().includes("credit")) {
        throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      }
      results.push(...fallbackClassify(batch, "falha temporária na IA"));
    }
  }

  return results;
}

export const Route = createFileRoute("/api/backorder-reclassificar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { getRequestUser, unauthorized } = await import(
            "@/lib/api-auth.server"
          );
          const caller = await getRequestUser(request);
          if (!caller) return unauthorized();

          const input = InputSchema.parse(await request.json());
          const results = await classifyItems(input.items);
          return Response.json({ results });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Falha na reclassificação.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
