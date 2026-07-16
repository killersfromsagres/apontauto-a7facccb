import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PointSchema = z.object({ x: z.number(), y: z.number() });
const PolygonSchema = z.array(PointSchema);

export const listMaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("talude_maps")
      .select("id, nome, image_path, image_width, image_height, periodicidade_dias, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getMapDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const [{ data: map, error: e1 }, { data: taludes, error: e2 }] = await Promise.all([
      context.supabase.from("talude_maps").select("*").eq("id", data.id).maybeSingle(),
      context.supabase.from("taludes").select("*").eq("map_id", data.id).order("numero"),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    if (!map) throw new Error("Mapa não encontrado");
    return { map, taludes: taludes ?? [] };
  });

export const createMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    nome: string;
    image_path: string;
    image_width?: number;
    image_height?: number;
    periodicidade_dias?: number;
  }) =>
    z
      .object({
        nome: z.string().min(1).max(200),
        image_path: z.string().min(1),
        image_width: z.number().int().positive().optional(),
        image_height: z.number().int().positive().optional(),
        periodicidade_dias: z.number().int().positive().max(3650).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("talude_maps")
      .insert({
        owner_id: context.userId,
        nome: data.nome,
        image_path: data.image_path,
        image_width: data.image_width ?? null,
        image_height: data.image_height ?? null,
        periodicidade_dias: data.periodicidade_dias ?? 180,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("talude_maps").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertTalude = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    map_id: string;
    numero: number;
    nome?: string | null;
    polygon: Array<{ x: number; y: number }>;
    status?: "programado" | "em_execucao" | "finalizado";
    data_programada?: string | null;
    data_execucao?: string | null;
    data_conclusao?: string | null;
    proxima_data?: string | null;
    periodicidade_dias?: number | null;
    observacoes?: string | null;
  }) =>
    z
      .object({
        id: z.string().uuid().optional(),
        map_id: z.string().uuid(),
        numero: z.number().int().positive(),
        nome: z.string().max(200).nullable().optional(),
        polygon: PolygonSchema,
        status: z.enum(["programado", "em_execucao", "finalizado"]).optional(),
        data_programada: z.string().nullable().optional(),
        data_execucao: z.string().nullable().optional(),
        data_conclusao: z.string().nullable().optional(),
        proxima_data: z.string().nullable().optional(),
        periodicidade_dias: z.number().int().positive().nullable().optional(),
        observacoes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const payload = {
      owner_id: context.userId,
      map_id: data.map_id,
      numero: data.numero,
      nome: data.nome ?? null,
      polygon: data.polygon,
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.data_programada !== undefined ? { data_programada: data.data_programada } : {}),
      ...(data.data_execucao !== undefined ? { data_execucao: data.data_execucao } : {}),
      ...(data.data_conclusao !== undefined ? { data_conclusao: data.data_conclusao } : {}),
      ...(data.proxima_data !== undefined ? { proxima_data: data.proxima_data } : {}),
      ...(data.periodicidade_dias !== undefined ? { periodicidade_dias: data.periodicidade_dias } : {}),
      ...(data.observacoes !== undefined ? { observacoes: data.observacoes } : {}),
    };


    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("taludes")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("taludes")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteTalude = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("taludes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────
// Rotina de auditoria e reparo automático para um mapa
// Detecta inconsistências, aplica correções seguras e retorna
// um log detalhado (checks / fixed / unresolved) para exibição.
// ─────────────────────────────────────────────────────────────
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

export const verifyAndRepairMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { map_id: string; dry_run?: boolean }) =>
    z.object({ map_id: z.string().uuid(), dry_run: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const startedAt = new Date().toISOString();
    const dryRun = data.dry_run ?? false;

    const [{ data: map, error: mapErr }, { data: rows, error: listErr }] = await Promise.all([
      context.supabase
        .from("talude_maps")
        .select("id, periodicidade_dias")
        .eq("id", data.map_id)
        .maybeSingle(),
      context.supabase.from("taludes").select("*").eq("map_id", data.map_id).order("numero"),
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
      const cur = patches.get(id) ?? {};
      patches.set(id, { ...cur, ...delta });
    };

    // 1. Polígonos inválidos ou corrompidos
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

    // 2. Numeração duplicada — manter o mais antigo (menor created_at implícito pela ordem)
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

    // 3. Datas inconsistentes — se inversas, corrige preservando a maior janela
    for (const t of taludes) {
      const dp = t.data_programada;
      const de = t.data_execucao;
      const dc = t.data_conclusao;

      if (dp && de && de < dp) {
        checks.push({
          taludeId: t.id,
          numero: t.numero,
          code: "date_order",
          message: `Talude ${t.numero}: execução (${de}) anterior à programada (${dp})`,
        });
        patch(t.id, { data_programada: de });
        fixed.push({
          taludeId: t.id,
          numero: t.numero,
          code: "date_order",
          message: "Programada ajustada para coincidir com execução",
          action: `data_programada: ${dp} → ${de}`,
        });
      }
      if (de && dc && dc < de) {
        checks.push({
          taludeId: t.id,
          numero: t.numero,
          code: "date_order",
          message: `Talude ${t.numero}: conclusão (${dc}) anterior à execução (${de})`,
        });
        patch(t.id, { data_execucao: dc });
        fixed.push({
          taludeId: t.id,
          numero: t.numero,
          code: "date_order",
          message: "Execução ajustada para coincidir com conclusão",
          action: `data_execucao: ${de} → ${dc}`,
        });
      }
    }

    // 4. Periodicidade ausente/negativa
    for (const t of taludes) {
      if (t.periodicidade_dias == null || t.periodicidade_dias <= 0) {
        const fallback = map.periodicidade_dias ?? 180;
        checks.push({
          taludeId: t.id,
          numero: t.numero,
          code: "missing_periodicity",
          message: `Talude ${t.numero}: periodicidade ausente`,
        });
        patch(t.id, { periodicidade_dias: fallback });
        fixed.push({
          taludeId: t.id,
          numero: t.numero,
          code: "missing_periodicity",
          message: `Definida periodicidade padrão do mapa`,
          action: `periodicidade_dias: → ${fallback}`,
        });
      }
    }

    // 5. Finalizado sem proxima_data — recomputar
    for (const t of taludes) {
      if (t.status === "finalizado") {
        const base = t.data_conclusao || t.data_execucao || t.data_programada;
        const per = (patches.get(t.id)?.periodicidade_dias as number | undefined) ??
          t.periodicidade_dias ??
          map.periodicidade_dias ??
          180;
        if (!t.proxima_data && base) {
          checks.push({
            taludeId: t.id,
            numero: t.numero,
            code: "missing_next_date",
            message: `Talude ${t.numero}: finalizado sem próxima data`,
          });
          const next = addDaysIso(base, per);
          patch(t.id, { proxima_data: next });
          fixed.push({
            taludeId: t.id,
            numero: t.numero,
            code: "missing_next_date",
            message: `Próxima data calculada`,
            action: `proxima_data: → ${next} (base ${base} + ${per}d)`,
          });
        }
        if (!t.data_conclusao && !t.data_execucao && !t.data_programada) {
          unresolved.push({
            taludeId: t.id,
            numero: t.numero,
            code: "finalizado_no_dates",
            message: "Finalizado sem qualquer data de referência",
          });
        }
      }
    }

    // 6. Em execução sem data_execucao — assume hoje
    for (const t of taludes) {
      if (t.status === "em_execucao" && !t.data_execucao) {
        checks.push({
          taludeId: t.id,
          numero: t.numero,
          code: "missing_exec_date",
          message: `Talude ${t.numero}: em execução sem data de início`,
        });
        const todayIso = new Date().toISOString().slice(0, 10);
        patch(t.id, { data_execucao: todayIso });
        fixed.push({
          taludeId: t.id,
          numero: t.numero,
          code: "missing_exec_date",
          message: "Data de execução definida como hoje",
          action: `data_execucao: → ${todayIso}`,
        });
      }
    }

    // Aplica correções
    let applied = 0;
    let deleted = 0;
    if (!dryRun) {
      for (const [id, delta] of patches) {
        const { error } = await context.supabase.from("taludes").update(delta).eq("id", id);
        if (error) {
          unresolved.push({
            taludeId: id,
            numero: null,
            code: "update_failed",
            message: `Falha ao aplicar correção: ${error.message}`,
          });
        } else {
          applied++;
        }
      }
      for (const id of toDelete) {
        const { error } = await context.supabase.from("taludes").delete().eq("id", id);
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
  });

