import { supabase } from "@/integrations/supabase/client";
import { brHolidays, isBusinessDay } from "@/lib/preventiva/business-days";
import { toCanonicalStatus, type WorkOrderStatus } from "@/modules/work-orders";

export type CapacitySetting = {
  id: string;
  equipe: string;
  tecnicos: number;
  minutos_dia: number;
  dias_semana: number[];
  eficiencia: number;
  minutos_por_os: number;
  observacao: string | null;
};

export type TeamAbsence = {
  id: string;
  equipe: string;
  tecnico: string;
  inicio: string;
  fim: string;
  motivo: string;
  observacao: string | null;
};

export type PlannedOS = {
  id: string;
  modalidade: "corretiva" | "refrigeracao";
  numeroOs: string;
  titulo: string;
  equipe: string;
  predio: string;
  andar: string;
  status: WorkOrderStatus;
  dataProgramada: string | null;
  dataSla: string | null;
  duracaoMin: number;
  executada: boolean;
};

export const DEFAULT_SETTING: Omit<CapacitySetting, "id" | "equipe"> = {
  tecnicos: 2,
  minutos_dia: 480,
  dias_semana: [1, 2, 3, 4, 5],
  eficiencia: 0.85,
  minutos_por_os: 60,
  observacao: null,
};

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Segunda-feira da semana de `d`. */
export function mondayOf(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = c.getDay();
  c.setDate(c.getDate() + (day === 0 ? -6 : 1 - day));
  return c;
}

export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export async function fetchCapacitySettings(): Promise<CapacitySetting[]> {
  const { data, error } = await supabase.from("capacity_settings").select("*").order("equipe");
  if (error) throw error;
  return (data ?? []) as CapacitySetting[];
}

export async function fetchAbsences(from: Date, to: Date): Promise<TeamAbsence[]> {
  const { data, error } = await supabase
    .from("team_absences")
    .select("*")
    .lte("inicio", ymd(to))
    .gte("fim", ymd(from));
  if (error) throw error;
  return (data ?? []) as TeamAbsence[];
}

/** Ordens de corretiva + refrigeração dentro da janela (por programação/SLA). */
export async function fetchPlannedOS(from: Date, to: Date): Promise<PlannedOS[]> {
  const cols = "id,numero_os,nome_os,equipe,predio,andar,status,data_programada,data_sla,fim";
  const [cor, ref] = await Promise.all([
    supabase.from("corretiva_os").select(cols).limit(3000),
    supabase.from("refrigeracao_os").select(cols).limit(3000),
  ]);
  if (cor.error) throw cor.error;
  if (ref.error) throw ref.error;

  const fromS = ymd(from);
  const toS = ymd(to);
  const map = (rows: Record<string, unknown>[], modalidade: PlannedOS["modalidade"]) =>
    rows.map((r) => {
      const status = toCanonicalStatus(r.status as string);
      return {
        id: String(r.id),
        modalidade,
        numeroOs: String(r.numero_os ?? ""),
        titulo: String(r.nome_os ?? ""),
        equipe: String(r.equipe ?? "").trim() || "Sem equipe",
        predio: String(r.predio ?? ""),
        andar: String(r.andar ?? ""),
        status,
        dataProgramada: (r.data_programada as string) ?? null,
        dataSla: (r.data_sla as string) ?? null,
        duracaoMin: modalidade === "refrigeracao" ? 90 : 60,
        executada: status === "concluida",
      } satisfies PlannedOS;
    });

  const all = [
    ...map((cor.data ?? []) as Record<string, unknown>[], "corretiva"),
    ...map((ref.data ?? []) as Record<string, unknown>[], "refrigeracao"),
  ];
  return all.filter((o) => {
    const d = o.dataProgramada ?? o.dataSla;
    return !d || (d >= fromS && d <= toS);
  });
}

export type DayLoad = {
  date: Date;
  key: string;
  businessDay: boolean;
  ausentes: number;
  capacidadeMin: number;
  planejadoMin: number;
  executadoMin: number;
  os: PlannedOS[];
};

export type TeamCapacity = {
  equipe: string;
  setting: CapacitySetting | null;
  tecnicos: number;
  dias: DayLoad[];
  capacidadeMin: number;
  planejadoMin: number;
  executadoMin: number;
  naoProgramadas: PlannedOS[];
  gargalo: boolean;
};

/** Monta a visão semanal por equipe: capacidade x carga planejada/executada. */
export function buildWeek(
  monday: Date,
  os: PlannedOS[],
  settings: CapacitySetting[],
  absences: TeamAbsence[],
): TeamCapacity[] {
  const days = weekDays(monday);
  const holidays = brHolidays(monday.getFullYear());
  const equipes = Array.from(
    new Set([...os.map((o) => o.equipe), ...settings.map((s) => s.equipe)]),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  return equipes.map((equipe) => {
    const setting = settings.find((s) => s.equipe === equipe) ?? null;
    const cfg = setting ?? { ...DEFAULT_SETTING, id: "", equipe };
    const doTime = os.filter((o) => o.equipe === equipe);

    const dias: DayLoad[] = days.map((date) => {
      const key = ymd(date);
      const dow = date.getDay();
      const trabalha = cfg.dias_semana.includes(dow) && isBusinessDay(date, holidays);
      const ausentes = absences.filter(
        (a) => a.equipe === equipe && a.inicio <= key && a.fim >= key,
      ).length;
      const efetivos = Math.max(0, cfg.tecnicos - ausentes);
      const capacidadeMin = trabalha ? Math.round(efetivos * cfg.minutos_dia * cfg.eficiencia) : 0;
      const doDia = doTime.filter((o) => (o.dataProgramada ?? "") === key);
      return {
        date,
        key,
        businessDay: trabalha,
        ausentes,
        capacidadeMin,
        planejadoMin: doDia.reduce((s, o) => s + o.duracaoMin, 0),
        executadoMin: doDia.filter((o) => o.executada).reduce((s, o) => s + o.duracaoMin, 0),
        os: doDia,
      };
    });

    const capacidadeMin = dias.reduce((s, d) => s + d.capacidadeMin, 0);
    const planejadoMin = dias.reduce((s, d) => s + d.planejadoMin, 0);
    return {
      equipe,
      setting,
      tecnicos: cfg.tecnicos,
      dias,
      capacidadeMin,
      planejadoMin,
      executadoMin: dias.reduce((s, d) => s + d.executadoMin, 0),
      naoProgramadas: doTime.filter(
        (o) => !o.dataProgramada && !o.executada && o.status !== "cancelada",
      ),
      gargalo: planejadoMin > capacidadeMin,
    } satisfies TeamCapacity;
  });
}

export type Conflict = { key: string; label: string; detail: string };

/** Conflitos: dia estourado, dia sem capacidade, OS após o SLA. */
export function detectConflicts(teams: TeamCapacity[]): Conflict[] {
  const out: Conflict[] = [];
  for (const t of teams) {
    for (const d of t.dias) {
      if (d.planejadoMin === 0) continue;
      if (!d.businessDay) {
        out.push({
          key: `${t.equipe}-${d.key}-nonbiz`,
          label: `${t.equipe} — ${d.key}`,
          detail: "OS programada em dia não útil / fora da jornada da equipe.",
        });
      } else if (d.planejadoMin > d.capacidadeMin) {
        out.push({
          key: `${t.equipe}-${d.key}-over`,
          label: `${t.equipe} — ${d.key}`,
          detail: `Sobrecarga de ${Math.round((d.planejadoMin - d.capacidadeMin) / 60)}h acima da capacidade.`,
        });
      }
      for (const o of d.os) {
        if (o.dataSla && d.key > o.dataSla && !o.executada) {
          out.push({
            key: `${o.id}-sla`,
            label: `OS ${o.numeroOs}`,
            detail: `Programada para ${d.key}, depois do SLA (${o.dataSla}).`,
          });
        }
      }
    }
  }
  return out;
}

/**
 * Sugestão automática: distribui as OS não programadas nos dias com folga,
 * priorizando SLA mais próximo e agrupando por prédio/andar (deslocamento).
 */
export function suggestSchedule(team: TeamCapacity): Record<string, string> {
  const minutosPorOS = team.setting?.minutos_por_os ?? DEFAULT_SETTING.minutos_por_os;
  const fila = [...team.naoProgramadas].sort((a, b) => {
    const sa = a.dataSla ?? "9999-12-31";
    const sb = b.dataSla ?? "9999-12-31";
    if (sa !== sb) return sa.localeCompare(sb);
    const p = a.predio.localeCompare(b.predio, "pt-BR");
    return p !== 0 ? p : a.andar.localeCompare(b.andar, "pt-BR");
  });

  const livre = team.dias.map((d) => ({ key: d.key, room: d.capacidadeMin - d.planejadoMin }));
  const plan: Record<string, string> = {};
  let i = 0;
  for (const os of fila) {
    while (i < livre.length && livre[i].room < minutosPorOS) i++;
    if (i >= livre.length) break;
    plan[os.id] = livre[i].key;
    livre[i].room -= os.duracaoMin || minutosPorOS;
  }
  return plan;
}

/** Aplica a programação (drag-and-drop ou simulação publicada). */
export async function applySchedule(
  changes: { id: string; modalidade: PlannedOS["modalidade"]; data: string | null }[],
) {
  for (const c of changes) {
    const table = c.modalidade === "refrigeracao" ? "refrigeracao_os" : "corretiva_os";
    const { error } = await supabase.from(table).update({ data_programada: c.data }).eq("id", c.id);
    if (error) throw error;
  }
}

export const fmtHours = (min: number) => `${(min / 60).toFixed(1)}h`;
