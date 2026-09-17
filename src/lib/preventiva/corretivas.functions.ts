import { supabase } from "@/integrations/supabase/client";
import { cacheOsList, getCachedOsList } from "@/lib/corretiva/db";
import { normalizeCorrectiveRefrigeracaoRows } from "./refrigeracao-routing";

const normalizeStatus = (status: unknown) =>
  String(status ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const isOpenCorrective = (status: unknown) => {
  const normalized = normalizeStatus(status);
  return ![
    "concluida",
    "concluido",
    "finalizada",
    "finalizado",
    "encerrada",
    "encerrado",
    "cancelada",
    "cancelado",
  ].includes(normalized);
};

const onlyOpen = <T extends { status?: unknown }>(rows: T[]) =>
  rows.filter((item) => isOpenCorrective(item.status));

const normalizeForProgramacao = <T extends {
  equipe?: unknown;
  nome_os?: unknown;
  tipo?: unknown;
  ativo?: unknown;
  equipamento?: unknown;
  predio?: unknown;
}>(rows: T[]) => normalizeCorrectiveRefrigeracaoRows(rows);

async function readCachedCorrectives() {
  try {
    const cached = await getCachedOsList();
    return normalizeForProgramacao(
      onlyOpen(cached).map((item) => ({
        ...item,
        corretiva_problemas: [],
      })),
    );
  } catch (error) {
    console.warn("[Programacao] Cache de corretivas indisponível:", error);
    return [];
  }
}

/**
 * Usa exatamente a sessão autenticada do navegador, como a tela Corretiva > Novo.
 * Não exclui `backorder_mensal`: backorders também precisam concorrer à programação
 * e têm prioridade na seleção das 2 corretivas por equipe.
 *
 * Para climatização/refrigeração, a equipe usada na Programação é sempre
 * recalculada pelo prédio com a mesma matriz das preventivas (REFRIG_1/2/3).
 */
export async function getLatestCorretivas() {
  const withProblems = await supabase
    .from("corretiva_os")
    .select("*, corretiva_problemas(gravidade, status_gestor)")
    .order("data_sla", { ascending: true, nullsFirst: false })
    .order("data_programada", { ascending: true, nullsFirst: false })
    .order("data_criacao", { ascending: true, nullsFirst: false })
    .limit(2000);

  if (!withProblems.error && (withProblems.data?.length ?? 0) > 0) {
    const rows = normalizeForProgramacao(onlyOpen(withProblems.data ?? []));
    cacheOsList((withProblems.data ?? []) as any).catch((error) =>
      console.warn("[Programacao] Não foi possível atualizar o cache:", error),
    );
    return rows;
  }

  if (withProblems.error) {
    console.warn(
      "[Programacao] Relação corretiva_problemas indisponível; tentando leitura simples:",
      withProblems.error,
    );
  }

  const plain = await supabase
    .from("corretiva_os")
    .select("*")
    .order("data_sla", { ascending: true, nullsFirst: false })
    .order("data_programada", { ascending: true, nullsFirst: false })
    .order("data_criacao", { ascending: true, nullsFirst: false })
    .limit(2000);

  if (!plain.error && (plain.data?.length ?? 0) > 0) {
    cacheOsList(plain.data as any).catch((error) =>
      console.warn("[Programacao] Não foi possível atualizar o cache:", error),
    );
    return normalizeForProgramacao(
      onlyOpen(plain.data ?? []).map((item) => ({
        ...item,
        corretiva_problemas: [],
      })),
    );
  }

  const cached = await readCachedCorrectives();
  if (cached.length > 0) {
    console.warn(
      `[Programacao] Supabase não retornou corretivas; usando ${cached.length} chamado(s) do cache local.`,
    );
    return cached;
  }

  if (plain.error) throw plain.error;
  if (withProblems.error) throw withProblems.error;
  return [];
}
