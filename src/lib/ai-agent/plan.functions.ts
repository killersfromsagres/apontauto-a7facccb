// Agente de IA "Assistente de Documentos": recebe o resumo da planilha já
// enriquecida + o pedido em linguagem natural e devolve um PLANO (spec) que o
// cliente executa de forma determinística para gerar Excel/PowerPoint/PDF/Power BI.

import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { SpecSchema, type Spec } from "@/features/ai-agent/types";
import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";

const ContextoSchema = z.object({
  arquivo: z.string().default(""),
  totalLinhas: z.number().int().nonnegative(),
  colunas: z.array(z.string()).max(120),
  amostrasPorColuna: z.record(z.string(), z.array(z.string()).max(10)),
  distribuicaoEquipe: z.array(z.string()).max(20).default([]),
  distribuicaoPredio: z.array(z.string()).max(20).default([]),
  ativosResolvidos: z.number().int().nonnegative().default(0),
  ativosNaoResolvidos: z.number().int().nonnegative().default(0),
});

const InputSchema = z.object({
  pedido: z.string().min(1).max(4000),
  contexto: ContextoSchema,
});

type Contexto = z.infer<typeof ContextoSchema>;

const SYSTEM_PROMPT = `Você é um consultor sênior de PCM (Planejamento e Controle de Manutenção) e especialista em Excel, PowerPoint, PDF e Power BI.

O sistema já processou a planilha de chamados do usuário e ENRIQUECEU cada linha com:
- "Equipe (IA)" e "Categoria (IA)": equipe responsável inferida pela descrição do serviço.
- "Prédio", "Andar", "Ambiente": localização resolvida pela hierarquia do código do ativo.
- "Status do Ativo": Resolvido / Não encontrado / Sem ativo.

Sua tarefa NÃO é calcular números. Sua tarefa é montar um PLANO de relatório em JSON.
O sistema executa o plano sobre a base completa e gera os arquivos com design corporativo.

Responda SOMENTE com um objeto JSON válido (sem markdown, sem comentários, sem texto antes ou depois) neste formato:
{
  "titulo": string,
  "subtitulo": string,
  "resumo": string[],
  "formatos": ("xlsx"|"pptx"|"pdf"|"powerbi"|"csv")[],
  "tabelas": [{
    "id": string,
    "nome": string,
    "descricao": string|null,
    "tipo": "agrupado"|"detalhe",
    "colunas": string[],
    "agruparPor": string[],
    "metricas": [{"rotulo": string, "campo": string|null, "agregacao": "contagem"|"soma"|"media"|"min"|"max"|"distintos"}],
    "filtros": [{"campo": string, "operador": "igual"|"diferente"|"contem"|"naoContem"|"vazio"|"naoVazio"|"maior"|"menor", "valor": string|null}],
    "ordenarPor": string|null,
    "ordem": "asc"|"desc",
    "limite": number|null
  }],
  "slides": [{"titulo": string, "subtitulo": string|null, "bullets": string[], "tabelaId": string|null, "grafico": "nenhum"|"barras"|"pizza"|"linha"}],
  "observacoes": string|null
}

Regras obrigatórias:
1. Use SOMENTE nomes de colunas que existem na lista "colunas" fornecida. Nunca invente colunas.
2. Nunca invente números, percentuais ou conclusões quantitativas.
3. Crie de 3 a 6 tabelas úteis (por Equipe (IA), Prédio, Andar, Categoria (IA)) e sempre uma tabela de detalhe.
4. Métrica padrão: {"rotulo":"Chamados","campo":null,"agregacao":"contagem"}.
5. Em "slides" crie de 4 a 8 slides referenciando o "id" das tabelas.
6. "formatos" deve refletir o que o usuário pediu; se ele não especificar, use ["xlsx","pptx","pdf","powerbi"].
7. Todos os textos em português do Brasil, tom executivo, direto e profissional.`;

/** Extrai o primeiro objeto JSON balanceado do texto. */
function extractJson(text: string): unknown | null {
  const cleaned = text.replace(/```json/gi, "```").split("```").join("\n");
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i += 1) {
    const c = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const FORMATO_HINTS: [RegExp, "xlsx" | "pptx" | "pdf" | "powerbi"][] = [
  [/excel|planilha|xlsx|tabela/i, "xlsx"],
  [/power\s*point|pptx|slide|apresenta/i, "pptx"],
  [/pdf|relat[óo]rio impresso|imprim/i, "pdf"],
  [/power\s*bi|dashboard|csv/i, "powerbi"],
];

function formatosDoPedido(pedido: string) {
  const out = FORMATO_HINTS.filter(([re]) => re.test(pedido)).map(([, f]) => f);
  return out.length > 0 ? out : (["xlsx", "pptx", "pdf", "powerbi"] as const).slice();
}

/** Plano determinístico usado quando a IA falha — o módulo nunca fica sem saída. */
function fallbackSpec(pedido: string, ctx: Contexto): Spec {
  const has = (c: string) => ctx.colunas.includes(c);
  const grupos = ["Equipe (IA)", "Prédio", "Andar", "Categoria (IA)"].filter(has);

  const tabelas: Spec["tabelas"] = grupos.map((g, i) => ({
    id: `g${i + 1}`,
    nome: `Chamados por ${g.replace(" (IA)", "")}`,
    descricao: `Distribuição dos chamados por ${g.replace(" (IA)", "").toLowerCase()}.`,
    tipo: "agrupado",
    colunas: [],
    agruparPor: [g],
    metricas: [{ rotulo: "Chamados", campo: null, agregacao: "contagem" }],
    filtros: [],
    ordenarPor: "Chamados",
    ordem: "desc",
    limite: 50,
  }));

  tabelas.push({
    id: "detalhe",
    nome: "Detalhamento dos chamados",
    descricao: "Base completa enriquecida com equipe, prédio, andar e ambiente.",
    tipo: "detalhe",
    colunas: ctx.colunas.slice(0, 12),
    agruparPor: [],
    metricas: [],
    filtros: [],
    ordenarPor: null,
    ordem: "desc",
    limite: 5000,
  });

  const slides = tabelas.slice(0, grupos.length).map((t) => ({
    titulo: t.nome,
    subtitulo: null,
    bullets: [
      "Leitura por ordem decrescente de volume.",
      "Use o ranking para priorizar a programação da semana.",
    ],
    tabelaId: t.id,
    grafico: "barras" as const,
  }));

  return SpecSchema.parse({
    titulo: "Relatório de Chamados",
    subtitulo: ctx.arquivo,
    resumo: [
      `Base com ${ctx.totalLinhas} chamados processados e enriquecidos.`,
      `${ctx.ativosResolvidos} ativos localizados na base e ${ctx.ativosNaoResolvidos} sem correspondência.`,
      "Distribuições por equipe, prédio e andar geradas automaticamente.",
    ],
    formatos: formatosDoPedido(pedido),
    tabelas,
    slides,
    observacoes:
      "Plano padrão aplicado automaticamente (o agente de IA não respondeu a tempo). Todos os números foram calculados sobre a base enviada.",
  });
}

/** Normaliza a resposta da IA para caber no schema mesmo com pequenos desvios. */
function coerceSpec(raw: unknown, pedido: string, ctx: Contexto): Spec | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const colunasValidas = new Set(ctx.colunas);

  const formatosBrutos = Array.isArray(obj.formatos) ? obj.formatos.map(String) : [];
  const formatos = formatosBrutos
    .map((f) => f.toLowerCase().trim())
    .map((f) => (f === "excel" ? "xlsx" : f === "powerpoint" ? "pptx" : f))
    .filter((f) => ["xlsx", "pptx", "pdf", "powerbi", "csv"].includes(f));

  const tabelas = (Array.isArray(obj.tabelas) ? obj.tabelas : [])
    .map((t, i) => {
      const tt = (t ?? {}) as Record<string, unknown>;
      const agruparPor = (Array.isArray(tt.agruparPor) ? tt.agruparPor : [])
        .map(String)
        .filter((c) => colunasValidas.has(c));
      const colunas = (Array.isArray(tt.colunas) ? tt.colunas : [])
        .map(String)
        .filter((c) => colunasValidas.has(c));
      const tipo = tt.tipo === "detalhe" || agruparPor.length === 0 ? "detalhe" : "agrupado";
      if (tipo === "agrupado" && agruparPor.length === 0) return null;
      if (tipo === "detalhe" && colunas.length === 0) return null;
      const metricas = (Array.isArray(tt.metricas) ? tt.metricas : [])
        .map((m) => {
          const mm = (m ?? {}) as Record<string, unknown>;
          const campo = mm.campo == null ? null : String(mm.campo);
          if (campo && !colunasValidas.has(campo)) return null;
          return {
            rotulo: String(mm.rotulo ?? "Chamados") || "Chamados",
            campo,
            agregacao: ["contagem", "soma", "media", "min", "max", "distintos"].includes(
              String(mm.agregacao),
            )
              ? String(mm.agregacao)
              : "contagem",
          };
        })
        .filter(Boolean);
      return {
        id: String(tt.id ?? `t${i + 1}`) || `t${i + 1}`,
        nome: String(tt.nome ?? `Análise ${i + 1}`) || `Análise ${i + 1}`,
        descricao: tt.descricao == null ? null : String(tt.descricao),
        tipo,
        colunas,
        agruparPor,
        metricas:
          tipo === "agrupado" && metricas.length === 0
            ? [{ rotulo: "Chamados", campo: null, agregacao: "contagem" }]
            : metricas,
        filtros: (Array.isArray(tt.filtros) ? tt.filtros : []).filter((f) => {
          const ff = (f ?? {}) as Record<string, unknown>;
          return typeof ff.campo === "string" && colunasValidas.has(ff.campo);
        }),
        ordenarPor: tt.ordenarPor == null ? null : String(tt.ordenarPor),
        ordem: tt.ordem === "asc" ? "asc" : "desc",
        limite: typeof tt.limite === "number" && tt.limite > 0 ? Math.min(tt.limite, 20000) : null,
      };
    })
    .filter(Boolean);

  if (tabelas.length === 0) return null;

  const ids = new Set(tabelas.map((t) => (t as { id: string }).id));
  const slides = (Array.isArray(obj.slides) ? obj.slides : []).map((s, i) => {
    const ss = (s ?? {}) as Record<string, unknown>;
    const tabelaId = ss.tabelaId == null ? null : String(ss.tabelaId);
    return {
      titulo: String(ss.titulo ?? `Slide ${i + 1}`) || `Slide ${i + 1}`,
      subtitulo: ss.subtitulo == null ? null : String(ss.subtitulo),
      bullets: (Array.isArray(ss.bullets) ? ss.bullets : []).map(String),
      tabelaId: tabelaId && ids.has(tabelaId) ? tabelaId : null,
      grafico: ["barras", "pizza", "linha", "nenhum"].includes(String(ss.grafico))
        ? String(ss.grafico)
        : "nenhum",
    };
  });

  const parsed = SpecSchema.safeParse({
    titulo: String(obj.titulo ?? "Relatório de Chamados") || "Relatório de Chamados",
    subtitulo: String(obj.subtitulo ?? ctx.arquivo ?? ""),
    resumo: (Array.isArray(obj.resumo) ? obj.resumo : []).map(String),
    formatos: formatos.length > 0 ? formatos : formatosDoPedido(pedido),
    tabelas,
    slides,
    observacoes: obj.observacoes == null ? null : String(obj.observacoes),
  });

  return parsed.success ? parsed.data : null;
}

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
