// Importação de OS de PREVENTIVA/CORRETIVA no módulo Corretiva.
// A leitura de Corretivas usa o motor contextual completo para validar a equipe,
// inclusive quando a planilha de origem já traz uma equipe preenchida.

import {
  readCorretivaOsFile,
  type CorretivaOsImport,
} from "@/lib/corretiva/reader";
import {
  classificarEquipeOs,
  equipeReconhecida,
} from "@/lib/corretiva/auto-equipe";
import { analyzeCorrectiveOrder } from "@/lib/corretiva/designation-agent";
import { supabase } from "@/integrations/supabase/client";

export const TIPO_PREVENTIVA = "Preventiva";
export const TIPO_BACKORDER = "Backorder";

export const EQUIPES_PREVENTIVA = [
  "Chaveiro",
  "Civil",
  "Hidráulica",
  "Elétrica",
] as const;
export type EquipePreventiva = (typeof EQUIPES_PREVENTIVA)[number];

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Casa um texto livre de equipe com uma das 4 equipes de preventiva. */
export function equipePreventivaFromText(
  valor: string | null | undefined,
): EquipePreventiva | null {
  const n = norm(valor);
  if (!n) return null;
  if (n.includes("chave") || n.includes("serralh")) return "Chaveiro";
  if (n.includes("hidraul") || n.includes("encanad")) return "Hidráulica";
  if (n.includes("eletr")) return "Elétrica";
  if (n.includes("civil") || n.includes("alvenaria") || n.includes("predial"))
    return "Civil";
  return null;
}

/**
 * Separação automática de Preventivas:
 * 1. usa a coluna Equipe quando reconhecível;
 * 2. senão, classifica pelo texto da OS;
 * 3. equipes fora das 4 (Pintura → Civil, Refrigeração → Elétrica) são redirecionadas.
 */
export function classificarPreventiva(row: CorretivaOsImport): EquipePreventiva {
  const daPlanilha = equipePreventivaFromText(row.equipe);
  if (daPlanilha) return daPlanilha;

  const c = classificarEquipeOs(row);
  switch (c.equipe) {
    case "Chaveiro":
      return "Chaveiro";
    case "Hidráulica":
      return "Hidráulica";
    case "Elétrica":
    case "Refrigeração":
      return "Elétrica";
    default:
      return "Civil";
  }
}

export type PreventivaRow = CorretivaOsImport & {
  tipo: string;
  equipe: EquipePreventiva;
};

export async function lerPreventivaFile(file: File): Promise<PreventivaRow[]> {
  const rows = await readCorretivaOsFile(file);
  return rows.map((r) => ({
    ...r,
    tipo: TIPO_PREVENTIVA,
    equipe: classificarPreventiva(r),
  }));
}

export const TIPO_CORRETIVA = "Corretiva";
export type CorretivaRow = CorretivaOsImport & { tipo: string; equipe: string };

/**
 * Resolve a equipe de uma Corretiva importada usando TODOS os campos disponíveis.
 *
 * Uma equipe reconhecida na planilha é preservada somente quando a leitura técnica
 * não traz evidência suficiente para contradizê-la. Evidência alta, ou média sem
 * ambiguidade, corrige automaticamente uma equipe de origem incorreta.
 */
export function resolveImportedCorrectiveTeam(row: CorretivaOsImport): string {
  const sourceTeam = row.equipe?.trim() || "";
  const sourceRecognized = equipeReconhecida(sourceTeam);
  const analysis = analyzeCorrectiveOrder({
    nome_os: row.nome_os,
    equipamento: row.equipamento,
    ativo: row.ativo,
    local: row.local,
    predio: row.predio,
    andar: row.andar,
    solicitante: row.solicitante,
    equipe: sourceTeam || null,
  });

  const decisive =
    analysis.hasSignal &&
    (analysis.confianca === "alta" ||
      (analysis.confianca === "media" && !analysis.ambiguo));

  if (decisive) return analysis.equipe;
  if (sourceRecognized) return sourceTeam;
  if (analysis.hasSignal) return analysis.equipe;

  // Compatibilidade com registros antigos sem qualquer informação técnica.
  // O motor marca esse cenário como baixa confiança/sem sinal para revisão.
  return analysis.equipe;
}

/**
 * Importação de OS de CORRETIVA: mantém todas as equipes possíveis
 * (Pintura, Refrigeração, Limpeza etc.) e valida semanticamente a equipe
 * contra descrição, equipamento, ativo e localização antes de persistir.
 */
export async function lerCorretivaFile(file: File): Promise<CorretivaRow[]> {
  const rows = await readCorretivaOsFile(file);

  let backorderCount = 0;
  try {
    const { count, error } = await supabase
      .from("corretiva_os")
      .select("*", { count: "exact", head: true })
      .eq("tipo", "Backorder");
    if (!error) backorderCount = count ?? 0;
  } catch (error) {
    console.warn("[Import] Erro ao contar backorders, assumindo 0", error);
  }

  const autoBackorder = backorderCount === 0;
  console.log(
    `[Import] Linhas lidas: ${rows.length}, Total Backorder Atual: ${backorderCount}, AutoBackorder: ${autoBackorder}`,
  );

  return rows.map((row) => {
    const equipeFinal = resolveImportedCorrectiveTeam(row);

    let tipoFinal = TIPO_CORRETIVA;
    if (autoBackorder) {
      tipoFinal = "Backorder";
    } else if (row.tipo) {
      const type = row.tipo.toLowerCase();
      if (type.includes("back") || type.includes("atras")) tipoFinal = "Backorder";
    }

    if (tipoFinal === TIPO_CORRETIVA && row.data_criacao) {
      const criacao = new Date(row.data_criacao);
      const diffDays =
        (new Date().getTime() - criacao.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays >= 35) tipoFinal = "Backorder";
    }

    return {
      ...row,
      tipo: tipoFinal,
      equipe: equipeFinal,
    } as CorretivaRow;
  });
}

export function contarPorEquipe(
  rows: PreventivaRow[],
): Record<EquipePreventiva, number> {
  const out = {
    Chaveiro: 0,
    Civil: 0,
    Hidráulica: 0,
    Elétrica: 0,
  } as Record<EquipePreventiva, number>;
  for (const row of rows) out[row.equipe]++;
  return out;
}

/** Verdadeiro quando a OS deve aparecer na aba Preventivas. */
export function isPreventiva(tipo: string | null | undefined): boolean {
  return norm(tipo).startsWith("prevent");
}
