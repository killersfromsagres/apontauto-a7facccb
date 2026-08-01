// Sincronização entre o Dashboard de Chamados e a tabela backorder_os.
// - fetchBackorderRows: lê todos os backorders e converte para ChamadoRow (fonte automática do dashboard).
// - fetchBackorderStatuses: lê finalizado/data_finalizacao para uma lista de OS.
// - setBackorderConcluido / setBackorderReaberto: escreve o status (upsert por PK `os`).
// - subscribeBackorderChanges: realtime pontual por OS (usado quando as linhas vêm de outra fonte).
// - subscribeBackorderTable: realtime para qualquer alteração — dispara refetch completo.

import { supabase } from "@/integrations/supabase/client";
import type { ChamadoRow } from "./parser";

export interface BackorderStatus {
  os: string;
  finalizado: boolean;
  data_finalizacao: string | null;
}

const CHUNK = 200;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function normalizeCriticidade(raw: string): string {
  const n = norm(raw);
  if (!n) return "NÃO INFORMADA";
  if (n.includes("ALTA") || n.includes("URGE") || n.includes("CRITIC")) return "ALTA";
  if (n.includes("MED") || n.includes("MOD")) return "MÉDIA";
  if (n.includes("BAIX")) return "BAIXA";
  return n;
}

type BackorderDbRow = {
  os: string;
  nome: string | null;
  ativo: string | null;
  predio: string | null;
  andar: string | null;
  espaco: string | null;
  atividade: string | null;
  equipe: string | null;
  criticidade: string | null;
  outros: string | null;
  termino_sla: string | null;
  data_solicitacao: string | null;
  data_finalizacao: string | null;
  finalizado: boolean | null;
};

function mapRowToChamado(r: BackorderDbRow): ChamadoRow {
  const done = !!r.finalizado;
  const ab = r.data_solicitacao ? new Date(r.data_solicitacao) : null;
  const lm = r.termino_sla ? new Date(r.termino_sla) : null;
  const cc = r.data_finalizacao ? new Date(r.data_finalizacao) : null;
  const categoria = (r.atividade || "OUTROS").toUpperCase();
  return {
    os: r.os,
    descricao: r.nome ?? "",
    categoria,
    equipe: r.equipe || "Outros",
    criticidade: normalizeCriticidade(r.criticidade ?? ""),
    criticidadeOriginal: r.criticidade ?? "",
    status: done ? "Concluído" : "Aberto",
    statusNorm: done ? "concluido" : "aberto",
    solicitante: r.outros || "NÃO INFORMADO",
    predio: r.predio ?? "",
    andar: r.andar ?? "",
    local: r.espaco ?? "",
    ativo: r.ativo ?? "",
    equipamento: "",
    dataAbertura: ab ? ab.toISOString() : null,
    dataAberturaTs: ab ? ab.getTime() : null,
    dataLimite: lm ? lm.toISOString() : null,
    dataLimiteTs: lm ? lm.getTime() : null,
    dataConclusao: cc ? cc.toISOString() : null,
    origem: "backorder",
  };
}

/** Carrega todas as OS da tabela backorder_os e converte para ChamadoRow. */
export async function fetchBackorderRows(): Promise<ChamadoRow[]> {
  // Paginação por chave (keyset) na PK `os`: evita OFFSET profundo, que faz o
  // Postgres reordenar e descartar dezenas de milhares de linhas a cada página
  // em bases grandes. A ordenação final (data_solicitacao desc, nulos por
  // último) é reaplicada em memória — resultado idêntico ao anterior.
  const pageSize = 5000;
  const raw: BackorderDbRow[] = [];
  let cursor: string | null = null;

  while (true) {
    let q = supabase
      .from("backorder_os")
      .select(
        "os, nome, ativo, predio, andar, espaco, atividade, equipe, criticidade, outros, termino_sla, data_solicitacao, data_finalizacao, finalizado",
      )
      .order("os", { ascending: true })
      .limit(pageSize);
    if (cursor) q = q.gt("os", cursor);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as BackorderDbRow[];
    raw.push(...rows);
    if (rows.length < pageSize) break;
    cursor = rows[rows.length - 1]!.os;
  }

  raw.sort((a, b) => {
    const da = a.data_solicitacao ? Date.parse(String(a.data_solicitacao)) : NaN;
    const db = b.data_solicitacao ? Date.parse(String(b.data_solicitacao)) : NaN;
    const va = Number.isNaN(da) ? null : da;
    const vb = Number.isNaN(db) ? null : db;
    if (va === null && vb === null) return 0;
    if (va === null) return 1; // nulos por último
    if (vb === null) return -1;
    return vb - va;
  });

  return raw.map(mapRowToChamado);
}


export async function fetchBackorderStatuses(
  osList: string[],
): Promise<Map<string, BackorderStatus>> {
  const map = new Map<string, BackorderStatus>();
  const unique = [...new Set(osList.filter(Boolean))];
  if (unique.length === 0) return map;
  for (const part of chunk(unique, CHUNK)) {
    const { data, error } = await supabase
      .from("backorder_os")
      .select("os, finalizado, data_finalizacao")
      .in("os", part);
    if (error) throw error;
    for (const r of data ?? []) {
      map.set(r.os, {
        os: r.os,
        finalizado: !!r.finalizado,
        data_finalizacao: r.data_finalizacao,
      });
    }
  }
  return map;
}

function fallbackDate(iso: string | null | undefined): string {
  if (iso) return iso;
  return new Date().toISOString();
}

/** Marca uma OS como concluída no backorder (upsert por PK `os`). */
export async function setBackorderConcluido(row: ChamadoRow): Promise<BackorderStatus> {
  const nowIso = new Date().toISOString();
  const payload = {
    os: row.os,
    finalizado: true,
    data_finalizacao: nowIso,
    data_solicitacao: fallbackDate(row.dataAbertura),
    nome: row.descricao || row.os,
    atividade: row.categoria || "",
    equipe: row.equipe || "Outros",
    criticidade: row.criticidade || "",
    predio: row.predio || "",
    andar: row.andar || "",
    espaco: row.local || "",
    ativo: row.ativo || "",
    termino_sla: row.dataLimite,
  };
  const { error } = await supabase.from("backorder_os").upsert(payload, { onConflict: "os" });
  if (error) throw error;
  return { os: row.os, finalizado: true, data_finalizacao: nowIso };
}

/** Reabre uma OS no backorder (finalizado = false). */
export async function setBackorderReaberto(os: string): Promise<BackorderStatus> {
  const { error } = await supabase
    .from("backorder_os")
    .update({ finalizado: false, data_finalizacao: null })
    .eq("os", os);
  if (error) throw error;
  return { os, finalizado: false, data_finalizacao: null };
}

/** Assina mudanças em backorder_os e notifica o callback com o novo status. */
export function subscribeBackorderChanges(onChange: (status: BackorderStatus) => void): () => void {
  const channel = supabase
    .channel("dashboard-chamados-backorder-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "backorder_os" }, (payload) => {
      const row = (payload.new ?? payload.old) as {
        os?: string;
        finalizado?: boolean;
        data_finalizacao?: string | null;
      } | null;
      if (!row?.os) return;
      onChange({
        os: row.os,
        finalizado: !!row.finalizado,
        data_finalizacao: row.data_finalizacao ?? null,
      });
    })
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** Assina qualquer alteração em backorder_os e dispara um callback (sem payload).
 *  Ideal para recarregar a lista completa quando linhas são inseridas/removidas. */
export function subscribeBackorderTable(onChange: () => void): () => void {
  const channel = supabase
    .channel("dashboard-chamados-backorder-table")
    .on("postgres_changes", { event: "*", schema: "public", table: "backorder_os" }, () =>
      onChange(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
