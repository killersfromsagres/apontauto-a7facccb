import type { TriagedOS, Equipe } from "../triage";
import { 
  businessDaysUntil, 
  brHolidays, 
  isBusinessDay 
} from "../business-days";

export interface IntelligentScheduleResult {
  buckets: Array<{
    week: {
      isoWeek: number;
      year: number;
      monday: Date;
      friday: Date;
      label: string;
    };
    os: TriagedOS[];
    porDia: TriagedOS[][];
  }>;
  totalOS: number;
  resumoEquipes: Record<string, number>;
}

const MINUTOS_UTEIS_DIA = 480; // 8h

export function intelligentSchedule(
  osList: TriagedOS[],
  startDate: Date = new Date()
): IntelligentScheduleResult {
  // Data fim: último dia do mês atual
  const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
  
  // Dias úteis disponíveis
  const bizDays = businessDaysUntil(startDate, endDate);
  if (bizDays.length === 0) {
    throw new Error("Não há dias úteis disponíveis no período selecionado.");
  }

  // Definição de tempos por equipe
  const getDuration = (equipe: Equipe): number => {
    if (equipe.startsWith("CLIMATIZAÇÃO E REFRIGERAÇÃO")) return 60;
    return 30;
  };

  // Ordenação estratégica: Equipe -> Prédio -> Andar -> Local
  const sortedOS = [...osList].sort((a, b) => {
    if (a.equipe !== b.equipe) return a.equipe.localeCompare(b.equipe);
    if (a.predio !== b.predio) return a.predio.localeCompare(b.predio);
    if (a.andar !== b.andar) return a.andar.localeCompare(b.andar);
    return a.local.localeCompare(b.local);
  });

  const resumoEquipes: Record<string, number> = {};
  osList.forEach(os => {
    resumoEquipes[os.equipe] = (resumoEquipes[os.equipe] || 0) + 1;
  });

  // Mapeamento de dias para semanas
  const weekMap = new Map<string, { 
    monday: Date; 
    friday: Date; 
    isoWeek: number; 
    year: number; 
    label: string;
    days: Date[];
  }>();

  bizDays.forEach(day => {
    const d = new Date(day);
    const dayOfWeek = d.getDay(); // 0=Dom, 1=Seg...
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    monday.setHours(0, 0, 0, 0);

    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    const key = monday.toISOString();
    if (!weekMap.has(key)) {
      // Cálculo de ISO Week simplificado
      const target = new Date(day.valueOf());
      const dayNr = (day.getDay() + 6) % 7;
      target.setDate(target.getDate() - dayNr + 3);
      const firstThursday = target.valueOf();
      target.setMonth(0, 1);
      if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
      }
      const isoWeek = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);

      weekMap.set(key, {
        monday,
        friday,
        isoWeek,
        year: monday.getFullYear(),
        label: `Semana ${isoWeek}`,
        days: []
      });
    }
    weekMap.get(key)!.days.push(day);
  });

  const weeks = Array.from(weekMap.values()).sort((a, b) => a.monday.getTime() - b.monday.getTime());
  
  // Estrutura de buckets
  const buckets = weeks.map(w => ({
    week: {
      isoWeek: w.isoWeek,
      year: w.year,
      monday: w.monday,
      friday: w.friday,
      label: w.label
    },
    os: [] as TriagedOS[],
    porDia: [[], [], [], [], []] as TriagedOS[][] // 0=Seg...4=Sex
  }));

  // Controle de carga por dia da equipe
  // Record<Equipe, Record<dataISO, minutosUsados>>
  const loadTracker: Record<string, Record<string, number>> = {};

  sortedOS.forEach(os => {
    const duration = getDuration(os.equipe);
    if (!loadTracker[os.equipe]) loadTracker[os.equipe] = {};

    let distributed = false;

    // Tenta encaixar no primeiro dia disponível (respeitando a ordem de semanas e dias)
    for (let i = 0; i < weeks.length && !distributed; i++) {
      const w = weeks[i];
      for (const day of w.days) {
        const dateKey = day.toISOString().split('T')[0];
        const currentLoad = loadTracker[os.equipe][dateKey] || 0;

        if (currentLoad + duration <= MINUTOS_UTEIS_DIA) {
          loadTracker[os.equipe][dateKey] = currentLoad + duration;
          buckets[i].os.push(os);
          
          const dow = day.getDay() - 1; // Ajusta para 0=Seg...4=Sex
          if (dow >= 0 && dow < 5) {
            buckets[i].porDia[dow].push(os);
          }
          
          distributed = true;
          break;
        }
      }
    }

    // Se não couber em nenhum dia útil do mês (overflow), colocamos no último dia útil disponível
    // (Poderia ser tratado como erro ou aba de overflow, mas para automação vamos forçar no final)
    if (!distributed) {
      const lastWeekIdx = buckets.length - 1;
      const lastDayOfLastWeek = weeks[lastWeekIdx].days[weeks[lastWeekIdx].days.length - 1];
      const dow = lastDayOfLastWeek.getDay() - 1;
      buckets[lastWeekIdx].os.push(os);
      if (dow >= 0 && dow < 5) {
        buckets[lastWeekIdx].porDia[dow].push(os);
      }
    }
  });

  return {
    buckets,
    totalOS: osList.length,
    resumoEquipes
  };
}
