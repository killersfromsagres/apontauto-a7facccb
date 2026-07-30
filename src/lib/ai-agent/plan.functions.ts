// Agente de IA "Assistente de Documentos": recebe o resumo da planilha já
// enriquecida + o pedido em linguagem natural e devolve um PLANO (spec) que o
// cliente executa de forma determinística para gerar Excel/PowerPoint/Power BI.

import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { SpecSchema } from "@/features/ai-agent/types";
import { createServerFn } from "@tanstack/react-start";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";

const InputSchema = z.object({
  pedido: z.string().min(1).max(4000),
  contexto: z.object({
    arquivo: z.string().default(""),
    totalLinhas: z.number().int().nonnegative(),
    colunas: z.array(z.string()).max(120),
    amostrasPorColuna: z.record(z.string(), z.array(z.string()).max(10)),
    distribuicaoEquipe: z.array(z.string()).max(20).default([]),
    distribuicaoPredio: z.array(z.string()).max(20).default([]),
    ativosResolvidos: z.number().int().nonnegative().default(0),
    ativosNaoResolvidos: z.number().int().nonnegative().default(0),
  }),
});

const SYSTEM_PROMPT = `Você é um consultor sênior de PCM (Planejamento e Controle de Manutenção) e especialista em Excel, PowerPoint e Power BI.

O sistema já processou a planilha de chamados do usuário e ENRIQUECEU cada linha com:
- "Equipe (IA)" e "Categoria (IA)": equipe responsável inferida pela descrição do serviço.
- "Prédio", "Andar", "Ambiente": localização resolvida pela hierarquia do código do ativo.
- "Status do Ativo": Resolvido / Não encontrado / Sem ativo.

Sua tarefa NÃO é calcular números. Sua tarefa é montar um PLANO de relatório em JSON.
O sistema executa o plano sobre a base completa e gera os arquivos com design corporativo.

Regras obrigatórias:
1. Use SOMENTE nomes de colunas que existem na lista "colunas" fornecida. Nunca invente colunas.
2. Nunca invente números, percentuais ou conclusões quantitativas: no "resumo" e nos "bullets"
   escreva análises qualitativas e instruções de leitura, sem afirmar valores que você não calculou.
3. Crie de 3 a 6 tabelas úteis. Prefira visões por Equipe (IA), Prédio, Andar e Categoria (IA).
   Inclua sempre uma tabela de detalhe com as colunas mais relevantes.
4. Para tabelas agrupadas use tipo "agrupado" com "agruparPor" e "metricas".
   A métrica padrão é {"rotulo":"Chamados","campo":null,"agregacao":"contagem"}.
5. Para tabelas de detalhe use tipo "detalhe" e liste as colunas em "colunas".
6. Em "slides" crie de 4 a 8 slides referenciando o "id" das tabelas. Use "grafico":"barras" ou
   "pizza" para visões agrupadas e "nenhum" quando quiser mostrar a tabela.
7. "formatos" deve refletir o que o usuário pediu; se ele não especificar, use ["xlsx","pptx","powerbi"].
8. Todos os textos em português do Brasil, tom executivo, direto e profissional.`;

export const planDocumentAgent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("Agente de IA indisponível no momento. Tente novamente mais tarde.");
    }

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3.5-flash");

    const prompt =
      `Pedido do usuário:\n"""${data.pedido}"""\n\n` +
      `Contexto da planilha já enriquecida:\n${JSON.stringify(data.contexto, null, 2)}\n\n` +
      `Monte o plano do relatório em JSON seguindo o schema.`;

    try {
      const { output } = await generateText({
        model,
        system: SYSTEM_PROMPT,
        output: Output.object({ schema: SpecSchema }),
        prompt,
      });
      return { spec: SpecSchema.parse(output) };
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        const text = error.text ?? "";
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = SpecSchema.safeParse(JSON.parse(match[0]));
          if (parsed.success) return { spec: parsed.data };
        }
        throw new Error("A IA não conseguiu montar o plano. Reformule o pedido e tente de novo.");
      }
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("429") || message.toLowerCase().includes("rate")) {
        throw new Error("Limite de requisições atingido. Aguarde alguns instantes.");
      }
      if (message.includes("402") || message.toLowerCase().includes("credit")) {
        throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      }
      throw new Error("Falha ao consultar o agente de IA. Tente novamente.");
    }
  });
