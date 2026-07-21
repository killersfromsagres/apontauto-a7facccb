// Reclassificação em lote de OS de backorder usando Lovable AI Gateway.
// Recebe uma lista de OS abertas e devolve a categoria (equipe) inferida
// pelo modelo a partir da descrição, ativo e solicitante.

import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { classifyBackorder } from "@/lib/backorder/classify";
import { createServerFn } from "@tanstack/react-start";
import { generateText, NoObjectGeneratedError, Output } from "ai";
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

type InputItem = z.infer<typeof InputSchema>["items"][number];

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
  return parsed.data.results
    .filter((result) => knownOs.has(result.os))
    .map((result) => ({
      os: result.os,
      categoria: result.categoria,
      confianca: result.confianca,
      justificativa: result.justificativa ?? undefined,
    }));
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

export const classifyBackorderWithAi = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<{ results: AiResult[] }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { results: fallbackClassify(data.items, "IA indisponível temporariamente") };
    }

    const BATCH_SIZE = 40;
    const results: AiResult[] = [];
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3.5-flash");

    for (let i = 0; i < data.items.length; i += BATCH_SIZE) {
      const batch = data.items.slice(i, i + BATCH_SIZE);
      const userPayload = batch.map((it) => ({
        os: it.os,
        descricao: it.descricao?.slice(0, 400) ?? "",
        ativo: it.ativo,
        solicitante: it.solicitante,
        predio: it.predio,
      }));

      try {
        const { output } = await generateText({
          model,
          system: SYSTEM_PROMPT,
          output: Output.object({ schema: AiOutputSchema }),
          prompt:
            `Classifique cada OS abaixo. Retorne no máximo uma classificação por OS, em JSON válido, no formato solicitado pelo schema.\n\n` +
            `OSs:\n${JSON.stringify(userPayload, null, 2)}`,
        });
        const validos = normalizeResults(batch, output);
        results.push(...(validos.length > 0 ? validos : fallbackClassify(batch, "retorno vazio da IA")));
      } catch (error) {
        if (NoObjectGeneratedError.isInstance(error)) {
          const parsed = parseJsonFallback(error.text);
          const validos = normalizeResults(batch, parsed);
          results.push(...(validos.length > 0 ? validos : fallbackClassify(batch, "retorno inválido da IA")));
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

    return { results };
  });
