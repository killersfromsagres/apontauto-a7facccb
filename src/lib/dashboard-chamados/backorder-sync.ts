// Sincronização entre o Dashboard de Chamados e a tabela backorder_os.
// - fetchBackorderStatuses: lê finalizado/data_finalizacao para uma lista de OS
// - setBackorderConcluido / setBackorderReaberto: escreve o status (upsert por PK `os`)
// - subscribeBackorderChanges: realtime para refletir alterações vindas do módulo Backorder

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
    // Campos obrigatórios / úteis quando a OS ainda não existir no backorder
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
  const { error } = await supabase
    .from("backorder_os")
    .upsert(payload, { onConflict: "os" });
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
export function subscribeBackorderChanges(
  onChange: (status: BackorderStatus) => void,
): () => void {
  const channel = supabase
    .channel("dashboard-chamados-backorder-sync")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "backorder_os" },
      (payload) => {
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
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
