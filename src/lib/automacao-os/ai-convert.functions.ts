import { createServerFn } from "@tanstack/react-start";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const InputSchema = z.object({ texto: z.string().min(1).max(20000) });

const OutputSchema = z.object({
  inicio: z.string().nullable(),
  lotes: z.array(
    z.object({
      categoria: z.string(),
      tecnicos: z.array(z.string()),
      os: z.array(z.string()),
    }),
  ),
});

const SYSTEM = `Você converte texto livre (WhatsApp, e-mail, relatórios) para o formato de LOTE do Prisma4.
Extraia:
- inicio: data/hora inicial no formato "DD/MM/AAAA HH:mm" (ex: "20/07/2026 08:00"). Se não houver, retorne null.
- lotes: array de blocos, cada um com:
  - categoria: uma string em minúsculas (ex: "refrigeracao", "eletrica", "civil", "hidraulica", "geral")
  - tecnicos: array de códigos/nomes de técnicos
  - os: array de números de OS (só dígitos)

Regras:
- Se técnicos ou OS aparecem juntos, agrupe em um único lote.
- Se houver múltiplas categorias, crie um lote por categoria.
- Ignore texto irrelevante.
- Retorne SEMPRE no JSON solicitado pelo schema, mesmo que algum campo fique vazio.`;

export const converterTextoParaLote = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente.");

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3.5-flash");

    try {
      const { output } = await generateText({
        model,
        system: SYSTEM,
        output: Output.object({ schema: OutputSchema }),
        prompt: `Texto de entrada:\n\n${data.texto}`,
      });
      return { ok: true as const, resultado: output, formato: renderLote(output) };
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        return { ok: false as const, erro: "Não foi possível extrair um lote válido." };
      }
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("429")) throw new Error("Limite de requisições atingido.");
      if (msg.includes("402")) throw new Error("Créditos de IA esgotados.");
      throw new Error(msg);
    }
  });

function renderLote(out: z.infer<typeof OutputSchema>): string {
  const linhas: string[] = [];
  if (out.inicio) linhas.push(`inicio: ${out.inicio}`, "");
  for (const l of out.lotes) {
    linhas.push("[LOTE]");
    linhas.push(`categoria: ${l.categoria}`);
    linhas.push(`tecnicos: ${l.tecnicos.join(", ")}`);
    linhas.push(`os: ${l.os.join(", ")}`);
    linhas.push("");
  }
  return linhas.join("\n").trim();
}
