// Importação de OS de PREVENTIVA no módulo Corretiva (aba Preventivas).
// Reaproveita o leitor de planilha da corretiva e restringe a separação
// automática às 4 equipes de preventiva: Chaveiro, Civil, Hidráulica e Elétrica.

import { readCorretivaOsFile, type CorretivaOsImport } from "@/lib/corretiva/reader";
import { classificarEquipeOs, equipeReconhecida } from "@/lib/corretiva/auto-equipe";
import { supabase } from "@/integrations/supabase/client";

export const TIPO_PREVENTIVA = "Preventiva";
export const TIPO_BACKORDER = "Backorder";

export const EQUIPES_PREVENTIVA = ["Chaveiro", "Civil", "Hidráulica", "Elétrica"] as const;
export type EquipePreventiva = (typeof EQUIPES_PREVENTIVA)[number];

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Casa um texto livre de equipe com uma das 4 equipes de preventiva. */
export function equipePreventivaFromText(valor: string | null | undefined): EquipePreventiva | null {
  const n = norm(valor);
  if (!n) return null;
  if (n.includes("chave") || n.includes("serralh")) return "Chaveiro";
  if (n.includes("hidraul") || n.includes("encanad")) return "Hidráulica";
  if (n.includes("eletr")) return "Elétrica";
  if (n.includes("civil") || n.includes("alvenaria") || n.includes("predial")) return "Civil";
  return null;
}

/**
 * Separação automática:
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

export type PreventivaRow = CorretivaOsImport & { tipo: string; equipe: EquipePreventiva };

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
 * Importação de OS de CORRETIVA: mantém todas as equipes possíveis
 * (inclusive Pintura e Refrigeração), usando a equipe da planilha quando
 * informada e a classificação automática por texto como fallback.
 */
export async function lerCorretivaFile(file: File): Promise<CorretivaRow[]> {
  const rows = await readCorretivaOsFile(file);
  
  // 1. Verificar se a aba Backorder está vazia no banco
  const { count: backorderCount } = await supabase
    .from("corretiva_os")
    .select("*", { count: 'exact', head: true })
    .eq("tipo", "Backorder");

  // 2. Se vazio, marcar todas as novas importações como Backorder automaticamente
  // Se já houver dados, as novas entram como Corretiva (a menos que a data seja antiga)
  const autoBackorder = backorderCount === 0;
  
  // 3. Log para auditoria (visível no console se houver erro)
  console.log(`[Import] Linhas lidas: ${rows.length}, Total Backorder Atual: ${backorderCount}, AutoBackorder: ${autoBackorder}`);

  return rows.map((r) => {
    // A equipe vinda da planilha tem precedência se for reconhecida
    let equipeFinal = (r.equipe && r.equipe.trim());
    
    // Se não tiver equipe ou não for reconhecida, usamos a IA de classificação por texto
    if (!equipeFinal || !equipeReconhecida(equipeFinal)) {
      // Combina descrição, equipamento e ativo para uma leitura mais precisa da IA
      const textForClassification = [r.nome_os, r.equipamento, r.ativo].filter(Boolean).join(" ");
      equipeFinal = classifyTeamByText(textForClassification).equipe;
    }
    
    // Regra: se autoBackorder, o tipo vira "Backorder"
    let tipoFinal = TIPO_CORRETIVA;
    if (autoBackorder) {
      tipoFinal = "Backorder";
    } else if (r.tipo) {
      // Tentar reconhecer "Backorder" ou "Corretiva" se vindo na planilha
      const t = r.tipo.toLowerCase();
      if (t.includes("back") || t.includes("atras")) tipoFinal = "Backorder";
    }

    // Identificação de atrasos (aprox 35 dias)
    // Se a data de criação for mais antiga que 30-35 dias, sugere Backorder
    if (tipoFinal === TIPO_CORRETIVA && r.data_criacao) {
      const criacao = new Date(r.data_criacao);
      const diffDays = (new Date().getTime() - criacao.getTime()) / (1000 * 60 * 60 * 24);
      // Ajustado para 35 dias conforme solicitado para identificação de atrasos
      if (diffDays >= 35) tipoFinal = "Backorder";
    }

    return {
      ...r,
      tipo: tipoFinal,
      equipe: equipeFinal,
    };
  });
}


export function contarPorEquipe(rows: PreventivaRow[]): Record<EquipePreventiva, number> {
  const out = { Chaveiro: 0, Civil: 0, Hidráulica: 0, Elétrica: 0 } as Record<
    EquipePreventiva,
    number
  >;
  for (const r of rows) out[r.equipe]++;
  return out;
}

/** Verdadeiro quando a OS deve aparecer na aba Preventivas. */
export function isPreventiva(tipo: string | null | undefined): boolean {
  return norm(tipo).startsWith("prevent");
}
