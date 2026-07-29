import { supabase } from "@/integrations/supabase/client";

/**
 * Busca global de entidades operacionais (OS, ativo, veículo e colaborador).
 * Cada consulta é isolada: se o usuário não tiver acesso ao módulo, a RLS
 * simplesmente devolve vazio e o resultado é ignorado — sem quebrar a busca.
 */
export type EntityKind = "os" | "ativo" | "veiculo" | "colaborador";

export type EntityResult = {
  id: string;
  kind: EntityKind;
  /** Rótulo principal exibido na lista. */
  title: string;
  /** Linha auxiliar com contexto (prédio, equipe, função...). */
  subtitle?: string;
  /** Grupo exibido no diálogo. */
  group: string;
  url: string;
};

const LIMIT = 5;

function like(term: string) {
  return `%${term.replace(/[%_]/g, "")}%`;
}

async function safe<T>(p: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await p;
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

export async function searchEntities(termRaw: string): Promise<EntityResult[]> {
  const term = termRaw.trim();
  if (term.length < 2) return [];
  const pattern = like(term);

  const [corretiva, refrigeracao, backorder, ativos, veiculos, colaboradores] = await Promise.all([
    safe(
      supabase
        .from("corretiva_os")
        .select("id, numero_os, nome_os, predio, equipe")
        .or(`numero_os.ilike.${pattern},nome_os.ilike.${pattern}`)
        .limit(LIMIT),
    ),
    safe(
      supabase
        .from("refrigeracao_os")
        .select("id, numero_os, nome_os, predio, equipe")
        .or(`numero_os.ilike.${pattern},nome_os.ilike.${pattern}`)
        .limit(LIMIT),
    ),
    safe(
      supabase
        .from("backorder_os")
        .select("os, nome, predio, equipe")
        .or(`os.ilike.${pattern},nome.ilike.${pattern}`)
        .limit(LIMIT),
    ),
    safe(
      supabase
        .from("assets_ref")
        .select("ativo, denominacao, unidade_negocio")
        .or(`ativo.ilike.${pattern},denominacao.ilike.${pattern}`)
        .limit(LIMIT),
    ),
    safe(
      supabase
        .from("frota_veiculos")
        .select("id, placa, modelo, marca, situacao")
        .or(`placa.ilike.${pattern},modelo.ilike.${pattern},marca.ilike.${pattern}`)
        .limit(LIMIT),
    ),
    safe(
      supabase
        .from("sst_colaboradores")
        .select("id, nome, matricula, funcao")
        .or(`nome.ilike.${pattern},matricula.ilike.${pattern}`)
        .limit(LIMIT),
    ),
  ]);

  const results: EntityResult[] = [];

  for (const os of corretiva as any[]) {
    results.push({
      id: `corretiva-${os.id}`,
      kind: "os",
      title: `OS ${os.numero_os} — Corretiva`,
      subtitle: [os.nome_os, os.predio, os.equipe].filter(Boolean).join(" · "),
      group: "Ordens de Serviço",
      url: "/corretiva-historico",
    });
  }

  for (const os of refrigeracao as any[]) {
    results.push({
      id: `refrig-${os.id}`,
      kind: "os",
      title: `OS ${os.numero_os} — Refrigeração`,
      subtitle: [os.nome_os, os.predio, os.equipe].filter(Boolean).join(" · "),
      group: "Ordens de Serviço",
      url: "/refrigeracao-historico",
    });
  }

  for (const os of backorder as any[]) {
    results.push({
      id: `backorder-${os.os}`,
      kind: "os",
      title: `OS ${os.os} — Backorder`,
      subtitle: [os.nome, os.predio, os.equipe].filter(Boolean).join(" · "),
      group: "Ordens de Serviço",
      url: "/backorder",
    });
  }

  for (const a of ativos as any[]) {
    results.push({
      id: `ativo-${a.ativo}`,
      kind: "ativo",
      title: `${a.ativo} — ${a.denominacao}`,
      subtitle: a.unidade_negocio || undefined,
      group: "Ativos",
      url: "/base-ativos",
    });
  }

  for (const v of veiculos as any[]) {
    results.push({
      id: `veiculo-${v.id}`,
      kind: "veiculo",
      title: `${v.placa}${v.modelo ? ` — ${v.modelo}` : ""}`,
      subtitle: [v.marca, v.situacao].filter(Boolean).join(" · "),
      group: "Frota",
      url: "/abastecimento",
    });
  }

  for (const c of colaboradores as any[]) {
    results.push({
      id: `colab-${c.id}`,
      kind: "colaborador",
      title: c.nome,
      subtitle: [c.matricula, c.funcao].filter(Boolean).join(" · "),
      group: "Colaboradores",
      url: "/seguranca-trabalho",
    });
  }

  return results;
}
