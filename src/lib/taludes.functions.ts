// Client-side API for taludes. Uses the browser Supabase client + RLS
// (RLS enforces owner scoping). Migrado de createServerFn para evitar
// dependência de variáveis de ambiente do runtime servidor que não
// estavam disponíveis em produção.
import { supabase } from "@/integrations/supabase/client";

type Point = { x: number; y: number };

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sessão expirada. Faça login novamente.");
  return data.user.id;
}

export async function listMaps() {
  const { data, error } = await supabase
    .from("talude_maps")
    .select("id, nome, image_path, image_width, image_height, periodicidade_dias, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getMapDetail(args: { data: { id: string } }) {
  const id = args.data.id;
  const [{ data: map, error: e1 }, { data: taludes, error: e2 }] = await Promise.all([
    supabase.from("talude_maps").select("*").eq("id", id).maybeSingle(),
    supabase.from("taludes").select("*").eq("map_id", id).order("numero"),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  if (!map) throw new Error("Mapa não encontrado");
  return { map, taludes: taludes ?? [] };
}

export async function createMap(args: {
  data: {
    nome: string;
    image_path: string;
    image_width?: number;
    image_height?: number;
    periodicidade_dias?: number;
  };
}) {
  const d = args.data;
  const owner_id = await currentUserId();
  const { data: row, error } = await supabase
    .from("talude_maps")
    .insert({
      owner_id,
      nome: d.nome,
      image_path: d.image_path,
      image_width: d.image_width ?? null,
      image_height: d.image_height ?? null,
      periodicidade_dias: d.periodicidade_dias ?? 180,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return row;
}

export async function deleteMap(args: { data: { id: string } }) {
  const { error } = await supabase.from("talude_maps").delete().eq("id", args.data.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function upsertTalude(args: {
  data: {
    id?: string;
    map_id: string;
    numero: number;
    nome?: string | null;
    polygon: Point[];
    status?: "programado" | "em_execucao" | "finalizado";
    data_programada?: string | null;
    data_execucao?: string | null;
    data_conclusao?: string | null;
    proxima_data?: string | null;
    periodicidade_dias?: number | null;
    observacoes?: string | null;
    cor?: string | null;
  };
}) {
  const d = args.data;
  const owner_id = await currentUserId();
  const payload = {
    owner_id,
    map_id: d.map_id,
    numero: d.numero,
    nome: d.nome ?? null,
    polygon: d.polygon as unknown as never,
    ...(d.status !== undefined ? { status: d.status } : {}),
    ...(d.data_programada !== undefined ? { data_programada: d.data_programada } : {}),
    ...(d.data_execucao !== undefined ? { data_execucao: d.data_execucao } : {}),
    ...(d.data_conclusao !== undefined ? { data_conclusao: d.data_conclusao } : {}),
    ...(d.proxima_data !== undefined ? { proxima_data: d.proxima_data } : {}),
    ...(d.periodicidade_dias !== undefined ? { periodicidade_dias: d.periodicidade_dias } : {}),
    ...(d.observacoes !== undefined ? { observacoes: d.observacoes } : {}),
    ...(d.cor !== undefined ? { cor: d.cor } : {}),
  } as Record<string, unknown>;


  if (d.id) {
    const { data: row, error } = await supabase
      .from("taludes")
      .update(payload)
      .eq("id", d.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  }
  const { data: row, error } = await supabase
    .from("taludes")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return row;
}

export async function deleteTalude(args: { data: { id: string } }) {
  const { error } = await supabase.from("taludes").delete().eq("id", args.data.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

type AuditEntry = {
  taludeId: string | null;
  numero: number | null;
  code: string;
  message: string;
  action?: string;
};

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function verifyAndRepairMap(args: {
  data: { map_id: string; dry_run?: boolean };
}) {
  const startedAt = new Date().toISOString();
  const dryRun = args.data.dry_run ?? false;
  const map_id = args.data.map_id;

  const [{ data: map, error: mapErr }, { data: rows, error: listErr }] = await Promise.all([
    supabase.from("talude_maps").select("id, periodicidade_dias").eq("id", map_id).maybeSingle(),
    supabase.from("taludes").select("*").eq("map_id", map_id).order("numero"),
  ]);
  if (mapErr) throw new Error(mapErr.message);
  if (listErr) throw new Error(listErr.message);
  if (!map) throw new Error("Mapa não encontrado");

  const taludes = (rows ?? []) as Array<{
    id: string;
    numero: number;
    polygon: unknown;
    status: "programado" | "em_execucao" | "finalizado";
    data_programada: string | null;
    data_execucao: string | null;
    data_conclusao: string | null;
    proxima_data: string | null;
    periodicidade_dias: number | null;
  }>;

  const checks: AuditEntry[] = [];
  const fixed: AuditEntry[] = [];
  const unresolved: AuditEntry[] = [];
  const toDelete: string[] = [];
  type Patch = {
    numero?: number;
    data_programada?: string | null;
    data_execucao?: string | null;
    data_conclusao?: string | null;
    proxima_data?: string | null;
    periodicidade_dias?: number | null;
  };
  const patches = new Map<string, Patch>();
  const patch = (id: string, delta: Patch) => {
    patches.set(id, { ...(patches.get(id) ?? {}), ...delta });
  };

  for (const t of taludes) {
    const poly = Array.isArray(t.polygon) ? (t.polygon as Array<{ x: unknown; y: unknown }>) : null;
    const valid =
      poly !== null &&
      poly.length >= 3 &&
      poly.every(
        (p) =>
          typeof p?.x === "number" &&
          typeof p?.y === "number" &&
          Number.isFinite(p.x) &&
          Number.isFinite(p.y) &&
          p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100,
      );
    if (!valid) {
      checks.push({
        taludeId: t.id,
        numero: t.numero,
        code: "invalid_polygon",
        message: `Talude ${t.numero}: polígono inválido (${Array.isArray(poly) ? poly.length : 0} pontos)`,
      });
      unresolved.push({
        taludeId: t.id,
        numero: t.numero,
        code: "invalid_polygon",
        message: "Requer redesenho manual da área",
      });
    }
  }

  const byNumero = new Map<number, typeof taludes>();
  for (const t of taludes) {
    const list = byNumero.get(t.numero) ?? [];
    list.push(t);
    byNumero.set(t.numero, list);
  }
  for (const [numero, list] of byNumero) {
    if (list.length > 1) {
      checks.push({
        taludeId: null,
        numero,
        code: "duplicate_numero",
        message: `Número ${numero} duplicado em ${list.length} taludes`,
      });
      const usedNumbers = new Set(taludes.map((x) => x.numero));
      for (let i = 1; i < list.length; i++) {
        let candidate = 1;
        while (usedNumbers.has(candidate)) candidate++;
        usedNumbers.add(candidate);
        patch(list[i].id, { numero: candidate });
        fixed.push({
          taludeId: list[i].id,
          numero: list[i].numero,
          code: "duplicate_numero",
          message: `Renumerado para ${candidate}`,
          action: `numero: ${list[i].numero} → ${candidate}`,
        });
      }
    }
  }

  for (const t of taludes) {
    const dp = t.data_programada;
    const de = t.data_execucao;
    const dc = t.data_conclusao;
    if (dp && de && de < dp) {
      checks.push({ taludeId: t.id, numero: t.numero, code: "date_order", message: `Talude ${t.numero}: execução (${de}) anterior à programada (${dp})` });
      patch(t.id, { data_programada: de });
      fixed.push({ taludeId: t.id, numero: t.numero, code: "date_order", message: "Programada ajustada para coincidir com execução", action: `data_programada: ${dp} → ${de}` });
    }
    if (de && dc && dc < de) {
      checks.push({ taludeId: t.id, numero: t.numero, code: "date_order", message: `Talude ${t.numero}: conclusão (${dc}) anterior à execução (${de})` });
      patch(t.id, { data_execucao: dc });
      fixed.push({ taludeId: t.id, numero: t.numero, code: "date_order", message: "Execução ajustada para coincidir com conclusão", action: `data_execucao: ${de} → ${dc}` });
    }
  }

  for (const t of taludes) {
    if (t.periodicidade_dias == null || t.periodicidade_dias <= 0) {
      const fallback = map.periodicidade_dias ?? 180;
      checks.push({ taludeId: t.id, numero: t.numero, code: "missing_periodicity", message: `Talude ${t.numero}: periodicidade ausente` });
      patch(t.id, { periodicidade_dias: fallback });
      fixed.push({ taludeId: t.id, numero: t.numero, code: "missing_periodicity", message: "Definida periodicidade padrão do mapa", action: `periodicidade_dias: → ${fallback}` });
    }
  }

  for (const t of taludes) {
    if (t.status === "finalizado") {
      const base = t.data_conclusao || t.data_execucao || t.data_programada;
      const per = patches.get(t.id)?.periodicidade_dias ?? t.periodicidade_dias ?? map.periodicidade_dias ?? 180;
      if (!t.proxima_data && base) {
        checks.push({ taludeId: t.id, numero: t.numero, code: "missing_next_date", message: `Talude ${t.numero}: finalizado sem próxima data` });
        const next = addDaysIso(base, per);
        patch(t.id, { proxima_data: next });
        fixed.push({ taludeId: t.id, numero: t.numero, code: "missing_next_date", message: "Próxima data calculada", action: `proxima_data: → ${next} (base ${base} + ${per}d)` });
      }
      if (!t.data_conclusao && !t.data_execucao && !t.data_programada) {
        unresolved.push({ taludeId: t.id, numero: t.numero, code: "finalizado_no_dates", message: "Finalizado sem qualquer data de referência" });
      }
    }
  }

  for (const t of taludes) {
    if (t.status === "em_execucao" && !t.data_execucao) {
      checks.push({ taludeId: t.id, numero: t.numero, code: "missing_exec_date", message: `Talude ${t.numero}: em execução sem data de início` });
      const todayIso = new Date().toISOString().slice(0, 10);
      patch(t.id, { data_execucao: todayIso });
      fixed.push({ taludeId: t.id, numero: t.numero, code: "missing_exec_date", message: "Data de execução definida como hoje", action: `data_execucao: → ${todayIso}` });
    }
  }

  let applied = 0;
  let deleted = 0;
  if (!dryRun) {
    for (const [id, delta] of patches) {
      const { error } = await supabase.from("taludes").update(delta).eq("id", id);
      if (error) {
        unresolved.push({ taludeId: id, numero: null, code: "update_failed", message: `Falha ao aplicar correção: ${error.message}` });
      } else {
        applied++;
      }
    }
    for (const id of toDelete) {
      const { error } = await supabase.from("taludes").delete().eq("id", id);
      if (!error) deleted++;
    }
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    dryRun,
    total: taludes.length,
    checks,
    fixed,
    unresolved,
    applied,
    deleted,
  };
}
