// Agente de IA "Assistente de Documentos": recebe o resumo da planilha já
// enriquecida + o pedido em linguagem natural e devolve um PLANO (spec) que o
// cliente executa de forma determinística para gerar Excel/PowerPoint/PDF/Power BI.

import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import {
  InputSchema,
  SYSTEM_PROMPT,
  coerceSpec,
  extractJson,
  fallbackSpec,
} from "@/lib/ai-agent/plan-core";
import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";

export const planDocumentAgent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { spec: fallbackSpec(data.pedido, data.contexto), fallback: true };
    }

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3.5-flash");

    const prompt =
      `Pedido do usuário:\n"""${data.pedido}"""\n\n` +
      `Contexto da planilha já enriquecida:\n${JSON.stringify(data.contexto, null, 2)}\n\n` +
      `Monte o plano do relatório e responda apenas com o JSON.`;

    try {
      const { text } = await generateText({
        model,
        system: SYSTEM_PROMPT,
        prompt,
        temperature: 0.2,
      });
      const spec = coerceSpec(extractJson(text), data.pedido, data.contexto);
      if (spec) return { spec, fallback: false };
      return { spec: fallbackSpec(data.pedido, data.contexto), fallback: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("429") || message.toLowerCase().includes("rate")) {
        throw new Error("Limite de requisições atingido. Aguarde alguns instantes.");
      }
      if (message.includes("402") || message.toLowerCase().includes("credit")) {
        throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      }
      return { spec: fallbackSpec(data.pedido, data.contexto), fallback: true };
    }
  });
