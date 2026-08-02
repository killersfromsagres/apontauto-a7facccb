// Núcleo do Copiloto Admin: prompt, ferramentas de leitura e execução de ações.
// Server-only (nome *.server.ts impede que entre no bundle do cliente).

import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { MENU_KEYS, loginToEmail } from "@/lib/users.functions";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import type { AcaoProposta, AcaoTipo, CopilotConsulta, CopilotMensagem } from "./types";

export const TABELAS_CHAVE = [
  "backorder_os",
  "corretiva_os",
  "corretiva_fotos",
  "corretiva_pecas",
  "corretiva_problemas",
  "refrigeracao_os",
  "refrigeracao_fotos",
  "preventiva_ac_registros",
  "assets",
  "profiles",
  "user_roles",
  "user_module_access",
  "agua_pontos",
  "agua_prog_entregas",
  "agua_visitas",
  "agua_filtro_ativos",
  "vehicles",
  "vehicle_checklists",
  "vehicle_fuelings",
  "frota_veiculos",
  "frota_abastecimentos",
  "material_solicitacoes",
  "material_solicitacao_itens",
  "materiais_catalogo",
  "legal_items",
  "sst_colaboradores",
  "lavanderia_pecas",
  "talude_marcacoes",
  "notifications",
  "audit_events",
  "job_runs",
] as const;

export const TABELAS_LIMPAVEIS = ["corretiva_os", "refrigeracao_os", "backorder_os"] as const;

const SYSTEM = `Você é o Copiloto Admin do sistema Apont Auto (gestão de manutenção/PCM, em português do Brasil).
Você conversa com o ADMINISTRADOR do sistema e pode:
1) CONSULTAR os dados reais do banco (Postgres/Supabase) com a ferramenta "consultar_dados" (somente SELECT).
2) PROPOR ações administrativas com a ferramenta "propor_acao". Você NUNCA executa a ação: ela só é aplicada
   depois que o admin confirmar na tela. Sempre explique o impacto da ação proposta.

Regras de consulta:
- Escreva SQL Postgres válido, uma única instrução, sempre começando por SELECT ou WITH.
- Nunca use INSERT/UPDATE/DELETE/DDL e nunca acesse os esquemas auth, storage ou vault.
- Prefira agregações (count, group by, filtros de data) a listar tudo. Máximo de 500 linhas por consulta.
- Tabelas principais: ${TABELAS_CHAVE.join(", ")}.
- Se não souber as colunas, consulte antes com: select * from <tabela> limit 3.
- Faça quantas consultas precisar (até 5) antes de responder.

Ao responder:
- Seja direto, em português, com números concretos e listas/tabelas em markdown quando ajudar.
- Cite de onde veio o dado (tabela/filtro).
- Se o pedido exigir alteração de código-fonte ou layout, explique que isso deve ser pedido ao Lovable — você atua sobre dados, usuários e permissões.`;

function acaoResumoPadrao(tipo: AcaoTipo, params: Record<string, unknown>) {
  return `${tipo} ${JSON.stringify(params)}`;
}

interface RunArgs {
  messages: CopilotMensagem[];
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
}

export async function runCopilot({ messages, supabase }: RunArgs) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("IA indisponível: chave do gateway não configurada.");

  const gateway = createLovableAiGatewayProvider(apiKey);
  const model = gateway("google/gemini-3.5-flash");

  const consultas: CopilotConsulta[] = [];
  const acoes: AcaoProposta[] = [];

  const consultar_dados = tool({
    description:
      "Executa uma consulta SELECT somente-leitura no banco do sistema e retorna as linhas em JSON (máx. 500).",
    inputSchema: z.object({
      sql: z.string().describe("Consulta SQL Postgres começando por SELECT ou WITH."),
      motivo: z.string().describe("Por que essa consulta é necessária."),
    }),
    execute: async ({ sql }) => {
      const { data, error } = await supabase.rpc("admin_readonly_query", { _sql: sql });
      if (error) return { erro: error.message };
      const rows = Array.isArray(data) ? data : [];
      consultas.push({
        sql,
        linhas: rows.length,
        amostraJson: JSON.stringify(rows.slice(0, 20)),
      });
      const payload = JSON.stringify(rows).slice(0, 20000);
      return { linhas: rows.length, dados: payload };
    },
  });

  const propor_acao = tool({
    description:
      "Propõe uma ação administrativa para o admin confirmar na tela. Não executa nada por si só.",
    inputSchema: z.object({
      tipo: z.enum([
        "definir_papel",
        "definir_menus",
        "bloquear_usuario",
        "resetar_senha",
        "atualizar_status_os",
        "limpar_tabela",
      ]),
      resumo: z.string().describe("Frase curta em português explicando o que será feito."),
      params: z
        .object({
          login: z.string().nullable().optional(),
          papel: z.enum(["admin", "user"]).nullable().optional(),
          menus: z.array(z.string()).nullable().optional(),
          bloquear: z.boolean().nullable().optional(),
          senha: z.string().nullable().optional(),
          tabela: z.string().nullable().optional(),
          id: z.string().nullable().optional(),
          status: z.string().nullable().optional(),
        })
        .describe("Parâmetros da ação. Use apenas os campos relevantes."),
    }),
    execute: async ({ tipo, resumo, params }) => {
      const limpos = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== null && v !== undefined),
      );
      const acao: AcaoProposta = {
        id: `${tipo}-${acoes.length}-${Date.now()}`,
        tipo,
        resumo: resumo || acaoResumoPadrao(tipo, limpos),
        params: limpos,
        perigosa: tipo === "limpar_tabela" || tipo === "resetar_senha" || tipo === "definir_papel",
      };
      acoes.push(acao);
      return { ok: true, aguardando_confirmacao: true, acao: acao.resumo };
    },
  });

  const { text } = await generateText({
    model,
    system: SYSTEM,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    tools: { consultar_dados, propor_acao },
    stopWhen: stepCountIs(8),
    temperature: 0.2,
  });

  return { reply: text?.trim() || "Não consegui gerar uma resposta.", consultas, acoes };
}

/* ------------------------------ Execução ------------------------------ */

type AdminClient = any;

async function adminClient(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as AdminClient;
}

async function findUserByLogin(admin: AdminClient, login: string) {
  const alvo = loginToEmail(String(login));
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(error.message);
  const user = data.users.find(
    (u: any) =>
      (u.email ?? "").toLowerCase() === alvo ||
      String((u.user_metadata as any)?.login ?? "").toLowerCase() === String(login).toLowerCase(),
  );
  if (!user) throw new Error(`Usuário "${login}" não encontrado.`);
  return user;
}

export async function executarAcao(
  acao: { tipo: AcaoTipo; params: Record<string, unknown> },
  callerId: string,
): Promise<{ ok: true; detalhe: string }> {
  const admin = await adminClient();
  const p = acao.params ?? {};

  switch (acao.tipo) {
    case "definir_papel": {
      const user = await findUserByLogin(admin, String(p.login ?? ""));
      const papel = p.papel === "admin" ? "admin" : "user";
      if (user.id === callerId) throw new Error("Você não pode alterar o seu próprio papel.");
      await admin.from("user_roles").delete().eq("user_id", user.id);
      const { error } = await admin.from("user_roles").insert({ user_id: user.id, role: papel });
      if (error) throw new Error(error.message);
      return { ok: true, detalhe: `Papel de ${p.login} definido como ${papel}.` };
    }
    case "definir_menus": {
      const user = await findUserByLogin(admin, String(p.login ?? ""));
      const menus = (Array.isArray(p.menus) ? (p.menus as string[]) : []).filter((k) =>
        (MENU_KEYS as readonly string[]).includes(k),
      );
      await admin.from("user_module_access").delete().eq("user_id", user.id);
      if (menus.length) {
        const { error } = await admin
          .from("user_module_access")
          .insert(menus.map((module_key) => ({ user_id: user.id, module_key })));
        if (error) throw new Error(error.message);
      }
      return { ok: true, detalhe: `${menus.length} módulo(s) liberados para ${p.login}.` };
    }
    case "bloquear_usuario": {
      const user = await findUserByLogin(admin, String(p.login ?? ""));
      if (user.id === callerId) throw new Error("Você não pode desativar a sua própria conta.");
      const bloquear = Boolean(p.bloquear);
      const { error } = await admin.auth.admin.updateUserById(user.id, {
        ban_duration: bloquear ? "876000h" : "none",
      } as any);
      if (error) throw new Error(error.message);
      return { ok: true, detalhe: `${p.login} ${bloquear ? "desativado" : "reativado"}.` };
    }
    case "resetar_senha": {
      const user = await findUserByLogin(admin, String(p.login ?? ""));
      const senha = String(p.senha ?? "");
      if (senha.length < 6) throw new Error("A senha precisa ter ao menos 6 caracteres.");
      const { error } = await admin.auth.admin.updateUserById(user.id, { password: senha });
      if (error) throw new Error(error.message);
      return { ok: true, detalhe: `Senha de ${p.login} redefinida.` };
    }
    case "atualizar_status_os": {
      const tabela = String(p.tabela ?? "");
      if (!["corretiva_os", "refrigeracao_os", "backorder_os"].includes(tabela)) {
        throw new Error("Tabela de OS não permitida.");
      }
      const id = String(p.id ?? "");
      const status = String(p.status ?? "");
      if (!id || !status) throw new Error("Informe o id da OS e o novo status.");
      const { error } = await admin.from(tabela).update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, detalhe: `OS ${id} atualizada para "${status}".` };
    }
    case "limpar_tabela": {
      const tabela = String(p.tabela ?? "");
      if (!(TABELAS_LIMPAVEIS as readonly string[]).includes(tabela)) {
        throw new Error("Essa tabela não pode ser limpa pelo copiloto.");
      }
      const { error } = await admin.from(tabela).delete().not("id", "is", null);
      if (error) throw new Error(error.message);
      return { ok: true, detalhe: `Tabela ${tabela} limpa.` };
    }
    default:
      throw new Error("Ação desconhecida.");
  }
}
