import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarIcon,
  CheckCircle2,
  Clock3,
  Cloud,
  Download,
  FileDown,
  FileCheck2,
  FileSpreadsheet,
  Gauge,
  History,
  Layers3,
  Loader2,
  Printer,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { downloadBlob } from "@/lib/download";
import { generateBlankTemplate } from "@/lib/preventiva/blank-templates";
import { weeksBetween, type WeekBucket, type WeekInfo } from "@/lib/preventiva/capacity";
import { getLatestCorretivas } from "@/lib/preventiva/corretivas.functions";
import {
  allocateCorrectivesForWeekTeam,
  CORRECTIVES_PER_DAY,
  pruneCorrectiveProgramReservations,
  releaseCorrectiveProgramReservation,
} from "@/lib/preventiva/corrective-program-reservations";
import {
  registerCorrectiveProgrammingBatch,
  type CorrectiveProgrammingEntry,
} from "@/lib/corretiva/programacao-state";
import {
  clearHistorico,
  deleteHistorico,
  getHistoricoBlob,
  listHistorico,
  saveHistorico,
  type HistoricoItem,
} from "@/lib/preventiva/history";
import {
  formatMinutes,
  mapCorrectives,
  MINUTOS_PADRAO_POR_EQUIPE,
  scheduleTeamMonth,
  type CorrectiveSourceRow,
  type DailyTeamLoad,
  type TeamMonthlySchedule,
} from "@/lib/preventiva/monthly-scheduler";
import { readPreventivaFiles, type FileAlert } from "@/lib/preventiva/reader";
import {
  EQUIPE_COLOR,
  REFRIG_1,
  REFRIG_2,
  REFRIG_3,
  triage,
  type Equipe,
  type TriagedOS,
} from "@/lib/preventiva/triage";
import { generateWeeklyProgramacao } from "@/lib/preventiva/weekly-exporter";
import { generateSlaDeadlineReport } from "@/lib/preventiva/sla-report";
import {
  polishWeeklyProgramacao,
  printWeeklyProgramacaoColor,
} from "@/lib/preventiva/weekly-export-polish";

export const Route = createFileRoute("/_authenticated/programacao")({
  component: ProgramacaoPage,
});

type SlotId = "CCH" | "REFRIG" | "ELETRICA";

interface SlotDef {
  id: SlotId;
  label: string;
  hint: string;
  color: string;
  equipes: Equipe[];
}

const SLOTS: SlotDef[] = [
  {
    id: "CCH",
    label: "CIVIL / HIDRÁULICA • CHAVEIRO MANUAL",
    hint: "Automático: Civil 00:30 e Hidráulica 01:00. Chaveiro é preenchido manualmente.",
    color: EQUIPE_COLOR.CIVIL,
    equipes: ["CIVIL", "HIDRÁULICA"],
  },
  {
    id: "REFRIG",
    label: "CLIMATIZAÇÃO E REFRIGERAÇÃO",
    hint: "Equipes 1, 2 e 3 separadas por prédio; padrão 01:00.",
    color: EQUIPE_COLOR["CLIMATIZAÇÃO E REFRIGERAÇÃO 1"],
    equipes: [
      "CLIMATIZAÇÃO E REFRIGERAÇÃO 1",
      "CLIMATIZAÇÃO E REFRIGERAÇÃO 2",
      "CLIMATIZAÇÃO E REFRIGERAÇÃO 3",
    ],
  },
  {
    id: "ELETRICA",
    label: "ELÉTRICA",
    hint: "Padrão 00:30 por OS; meta diária de 09:00.",
    color: EQUIPE_COLOR.ELÉTRICA,
    equipes: ["ELÉTRICA"],
  },
];

interface GeneratedFile {
  id: string;
  filename: string;
  blob: Blob;
  week: number;
  slot: SlotId;
  slotLabel: string;
  totalOS: number;
  preventiveCount: number;
  correctiveCount: number;
  remainingMinutes: number;
  periodStart: string;
  periodEnd: string;
}

const TITULO_PADRAO = "GRUPO GPS • SHERWIN WILLIAMS / DEMARCHI";
const norm = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function predioMatches(predio: string, buildings: string[]): boolean {
  const normalized = norm(predio);
  return buildings.some(
    (building) =>
      normalized === norm(building) || normalized.startsWith(norm(building)),
  );
}

function filterForSlot(items: TriagedOS[], slot: SlotId): TriagedOS[] {
  if (slot === "CCH") {
    return items.filter((item) =>
      ["CIVIL", "HIDRÁULICA"].includes(item.equipe),
    );
  }
  if (slot === "ELETRICA")
    return items.filter((item) => item.equipe === "ELÉTRICA");
  return items
    .filter((item) => item.equipe.startsWith("CLIMAT"))
    .map((item) => {
      if (predioMatches(item.predio, REFRIG_2))
        return { ...item, equipe: "CLIMATIZAÇÃO E REFRIGERAÇÃO 2" as Equipe };
      if (predioMatches(item.predio, REFRIG_3))
        return { ...item, equipe: "CLIMATIZAÇÃO E REFRIGERAÇÃO 3" as Equipe };
      if (predioMatches(item.predio, REFRIG_1))
        return { ...item, equipe: "CLIMATIZAÇÃO E REFRIGERAÇÃO 1" as Equipe };
      return { ...item, equipe: "CLIMATIZAÇÃO E REFRIGERAÇÃO 1" as Equipe };
    });
}

const isoLocal = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function appendReservedCorrectives(
  bucket: WeekBucket,
  loads: DailyTeamLoad[],
  correctivesByDay: TriagedOS[][],
  minutesPerOs: 30 | 60,
  week: WeekInfo,
): { bucket: WeekBucket; loads: DailyTeamLoad[] } {
  const nextBucket: WeekBucket = {
    ...bucket,
    os: [...bucket.os],
    porDia: bucket.porDia.map((items) => [...items]),
  };
  const nextLoads = loads.map((load) => ({
    ...load,
    correctiveCount: 0,
    correctiveDeficit:
      load.correctiveCapacity ?? CORRECTIVES_PER_DAY,
  }));

  correctivesByDay.slice(0, 5).forEach((dayItems, dayIndex) => {
    const loadIndex = nextLoads.findIndex((load) => load.dayIndex === dayIndex);
    const dayCapacity =
      loadIndex >= 0
        ? nextLoads[loadIndex].correctiveCapacity ?? CORRECTIVES_PER_DAY
        : CORRECTIVES_PER_DAY;
    const limitedItems = dayItems.slice(0, Math.max(0, dayCapacity));
    if (limitedItems.length === 0) return;

    nextBucket.os.push(...limitedItems);
    nextBucket.porDia[dayIndex] = [
      ...(nextBucket.porDia[dayIndex] ?? []),
      ...limitedItems,
    ];

    const addedMinutes = limitedItems.length * minutesPerOs;
    if (loadIndex >= 0) {
      const targetLoad = nextLoads[loadIndex];
      const scheduledMinutes = targetLoad.scheduledMinutes + addedMinutes;
      nextLoads[loadIndex] = {
        ...targetLoad,
        correctiveCount: limitedItems.length,
        scheduledMinutes,
        remainingMinutes: Math.max(
          0,
          targetLoad.targetMinutes - scheduledMinutes,
        ),
        correctiveDeficit: Math.max(
          0,
          dayCapacity - limitedItems.length,
        ),
      };
    } else {
      const date = new Date(week.monday);
      date.setDate(date.getDate() + dayIndex);
      nextLoads.push({
        date,
        dateKey: isoLocal(date),
        dayIndex,
        preventiveCount: 0,
        correctiveCount: limitedItems.length,
        scheduledMinutes: addedMinutes,
        remainingMinutes: Math.max(0, 540 - addedMinutes),
        targetMinutes: 540,
        correctiveDeficit: Math.max(
          0,
          CORRECTIVES_PER_DAY - limitedItems.length,
        ),
      });
    }
  });

  nextLoads.sort((a, b) => a.dayIndex - b.dayIndex);
  return { bucket: nextBucket, loads: nextLoads };
}

function ProgramacaoPage() {
  const [slotFiles, setSlotFiles] = useState<Record<SlotId, File | null>>({
    CCH: null,
    REFRIG: null,
    ELETRICA: null,
  });
  const [tempoPorEquipe, setTempoPorEquipe] = useState<Record<Equipe, 30 | 60>>(
    { ...MINUTOS_PADRAO_POR_EQUIPE },
  );
  const [processing, setProcessing] = useState(false);
  const [slaProcessing, setSlaProcessing] = useState(false);
  const [historyBusyId, setHistoryBusyId] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedFile[]>([]);
  const [alerts, setAlerts] = useState<FileAlert[]>([]);
  const [statusMessages, setStatusMessages] = useState<string[]>([]);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [startDate, setStartDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const reloadHistorico = useCallback(async () => {
    try {
      setHistorico(await listHistorico());
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => void reloadHistorico(), [reloadHistorico]);

  const hasAnyFile = useMemo(
    () => Object.values(slotFiles).some(Boolean),
    [slotFiles],
  );
  const attachedCount = useMemo(
    () => Object.values(slotFiles).filter(Boolean).length,
    [slotFiles],
  );
  const historyGroups = useMemo(() => {
    const groups = new Map<string, HistoricoItem[]>();
    historico.forEach((item) => {
      const key = item.periodStart
        ? `${item.periodStart}|${item.periodEnd ?? ""}`
        : `semana-${item.week}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });
    return [...groups.entries()];
  }, [historico]);

  const setSlot = useCallback((slot: SlotId, file: File | null) => {
    if (file && !file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Envie um arquivo .xlsx");
      return;
    }
    setSlotFiles((current) => ({ ...current, [slot]: file }));
  }, []);

  const setTeamMinutes = useCallback((equipe: Equipe, minutes: 30 | 60) => {
    setTempoPorEquipe((current) => ({ ...current, [equipe]: minutes }));
  }, []);

  const handlePrint = useCallback(async (blob: Blob) => {
    try {
      await printWeeklyProgramacaoColor(blob);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao preparar a impressão",
      );
    }
  }, []);

  const collectCurrentPreventives = useCallback(async (): Promise<TriagedOS[]> => {
    const items: TriagedOS[] = [];
    for (const slot of SLOTS) {
      const file = slotFiles[slot.id];
      if (!file) continue;
      const read = await readPreventivaFiles([file]);
      items.push(...filterForSlot(triage(read.rows), slot.id));
    }
    return items;
  }, [slotFiles]);

  const handleDownloadSla = useCallback(async () => {
    if (!hasAnyFile || slaProcessing) {
      if (!hasAnyFile) toast.warning("Anexe as planilhas mensais primeiro.");
      return;
    }

    setSlaProcessing(true);
    try {
      const preventiveItems = await collectCurrentPreventives();
      const report = await generateSlaDeadlineReport(
        preventiveItems,
        startDate,
      );
      downloadBlob(report.blob, report.filename);
      toast.success(
        report.total > 0
          ? `Relatório atualizado: ${report.total} preventiva(s) com Término SLA antes do dia 28.`
          : "Relatório atualizado. Nenhuma preventiva com Término SLA antes do dia 28 foi encontrada.",
      );
    } catch (error) {
      console.error("[Programacao] Falha ao gerar relatório de SLA:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível gerar o relatório de Término SLA.",
      );
    } finally {
      setSlaProcessing(false);
    }
  }, [
    collectCurrentPreventives,
    hasAnyFile,
    slaProcessing,
    startDate,
  ]);

  const historyBlob = useCallback(async (item: HistoricoItem) => {
    setHistoryBusyId(item.id);
    try {
      return await getHistoricoBlob(item);
    } finally {
      setHistoryBusyId(null);
    }
  }, []);

  const handleHistoryDownload = useCallback(
    async (item: HistoricoItem) => {
      try {
        const blob = await historyBlob(item);
        downloadBlob(blob, item.filename);
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível recuperar a planilha do histórico.",
        );
      }
    },
    [historyBlob],
  );

  const handleHistoryPrint = useCallback(
    async (item: HistoricoItem) => {
      try {
        const blob = await historyBlob(item);
        await handlePrint(blob);
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível recuperar a planilha para impressão.",
        );
      }
    },
    [handlePrint, historyBlob],
  );

  const generate = async () => {
    if (!hasAnyFile) {
      toast.error("Anexe pelo menos uma planilha mensal de OS.");
      return;
    }
    setProcessing(true);
    setAlerts([]);
    setStatusMessages([]);

    try {
      const monthEnd = new Date(
        startDate.getFullYear(),
        startDate.getMonth() + 1,
        0,
      );
      const weeks = weeksBetween(startDate, monthEnd);
      const correctiveRows =
        (await getLatestCorretivas()) as unknown as CorrectiveSourceRow[];
      pruneCorrectiveProgramReservations(correctiveRows);
      const correctiveMap = mapCorrectives(correctiveRows, startDate);
      const output: GeneratedFile[] = [];
      const allCorrectiveProgrammingEntries: CorrectiveProgrammingEntry[] = [];
      const allAlerts: FileAlert[] = [];
      const messages: string[] = [
        `Corretivas abertas: ${correctiveMap.items.length}; críticas: ${correctiveMap.critical}; backorders: ${correctiveMap.backorders}.`,
      ];
      if (correctiveMap.unassigned.length > 0) {
        messages.push(
          `${correctiveMap.unassigned.length} corretiva(s) sem equipe identificável não foram distribuídas.`,
        );
      }

      for (const slot of SLOTS) {
        const file = slotFiles[slot.id];
        if (!file) continue;
        const read = await readPreventivaFiles([file]);
        allAlerts.push(...read.alerts);
        const preventiveItems = filterForSlot(triage(read.rows), slot.id);
        if (preventiveItems.length === 0) {
          messages.push(
            `${slot.label}: nenhuma preventiva reconhecida; as semanas serão compostas pelas corretivas prioritárias disponíveis.`,
          );
        }

        const schedules = new Map<Equipe, TeamMonthlySchedule>();
        for (const equipe of slot.equipes) {
          const schedule = scheduleTeamMonth({
            equipe,
            preventivas: preventiveItems.filter(
              (item) => item.equipe === equipe,
            ),
            corretivas: [],
            weeks,
            from: startDate,
            until: monthEnd,
            minutosPorOS: tempoPorEquipe[equipe],
            reserveCorrectiveSlots: true,
          });
          schedules.set(equipe, schedule);

          const allLoads = schedule.loadsByWeek.flat();
          const remaining = allLoads.reduce(
            (total, load) => total + load.remainingMinutes,
            0,
          );
          messages.push(
            `${equipe}: ${schedule.scheduledPreventivas} preventiva(s) em sequência contínua de Prédio → Andar → Local; saldo mensal ${formatMinutes(remaining)}. As corretivas ficam no final de cada dia.`,
          );

          if (schedule.preventiveDaysWithoutWork.length === 0) {
            messages.push(
              `${equipe}: cobertura preventiva distribuída em todos os dias úteis do período; corretivas ficam sempre no final de cada dia.`,
            );
          } else {
            messages.push(
              `ATENÇÃO • ${equipe}: ${schedule.preventiveDaysWithoutWork.length} dia(s) útil(eis) ficaram sem preventiva porque o volume mensal não foi suficiente para preencher toda a capacidade: ${schedule.preventiveDaysWithoutWork.join(", ")}.`,
            );
          }

          if (schedule.overflowPreventivas.length) {
            messages.push(
              `${equipe}: excedente de ${schedule.overflowPreventivas.length} preventiva(s) após preencher a capacidade do mês.`,
            );
          }
        }

        for (let weekIndex = 0; weekIndex < weeks.length; weekIndex += 1) {
          const week = weeks[weekIndex];
          const periodStart = isoLocal(week.monday);
          const periodEnd = isoLocal(week.friday);
          const bucketsPorEquipe = new Map<Equipe, WeekBucket>();
          const cargasPorEquipe = new Map<Equipe, DailyTeamLoad[]>();
          const correctiveProgrammingEntries: CorrectiveProgrammingEntry[] = [];

          for (const equipe of slot.equipes) {
            const schedule = schedules.get(equipe);
            if (!schedule) continue;

            const weeklyLoads = schedule.loadsByWeek[weekIndex] ?? [];
            const correctiveCapacities = Array.from({ length: 5 }, (_, dayIndex) => {
              const load = weeklyLoads.find((item) => item.dayIndex === dayIndex);
              return load?.correctiveCapacity ?? 0;
            });

            const allocation = allocateCorrectivesForWeekTeam({
              rows: correctiveRows,
              equipe,
              periodStart,
              periodEnd,
              referenceDate: week.monday,
              perDay: CORRECTIVES_PER_DAY,
              businessDays: 5,
              perDayCapacities: correctiveCapacities,
            });

            allocation.byDay.forEach((dayRows, dayIndex) => {
              dayRows.forEach((row) => {
                const osId = String(row.id ?? "").trim();
                if (!osId) return;
                correctiveProgrammingEntries.push({
                  osId,
                  numeroOs: String(row.numero_os ?? osId),
                  equipe,
                  periodStart,
                  periodEnd,
                  dayIndex,
                });
              });
            });

            const mappedCorrectivesByDay = allocation.byDay.map((dayRows) =>
              mapCorrectives(dayRows, week.monday).items.filter(
                (item) => item.equipe === equipe,
              ),
            );
            const mappedCorrectiveCount = mappedCorrectivesByDay.flat().length;

            const augmented = appendReservedCorrectives(
              schedule.buckets[weekIndex],
              schedule.loadsByWeek[weekIndex],
              mappedCorrectivesByDay,
              tempoPorEquipe[equipe],
              week,
            );
            bucketsPorEquipe.set(equipe, augmented.bucket);
            cargasPorEquipe.set(equipe, augmented.loads);
            messages.push(
              `Semana ${week.isoWeek} • ${equipe}: ${mappedCorrectiveCount} corretiva(s) adicionada(s) ao final dos dias, com backorders e urgências operacionais na frente da fila corretiva.`,
            );
          }

          const totalOS = [...bucketsPorEquipe.values()].reduce(
            (total, bucket) => total + bucket.os.length,
            0,
          );
          const preventiveCount = [...bucketsPorEquipe.values()].reduce(
            (total, bucket) =>
              total +
              bucket.os.filter((item) => norm(item.tipo) !== "CORRETIVA")
                .length,
            0,
          );
          const correctiveCount = totalOS - preventiveCount;
          const remainingMinutes = [...cargasPorEquipe.values()]
            .flat()
            .reduce((total, load) => total + load.remainingMinutes, 0);
          const rawBlob = await generateWeeklyProgramacao({
            titulo: TITULO_PADRAO,
            week,
            bucketsPorEquipe,
            cargasPorEquipe,
            minutosPorEquipe: tempoPorEquipe,
            ativoIndex: read.ativoIndex,
          });
          const blob = await polishWeeklyProgramacao(rawBlob);

          // Reserva apenas no snapshot/localStorage durante a montagem do lote.
          // A persistência definitiva no banco acontece uma única vez ao final,
          // de forma atômica, depois que todas as planilhas foram geradas.
          allCorrectiveProgrammingEntries.push(...correctiveProgrammingEntries);

          const selectedById = new Map(
            correctiveProgrammingEntries.map((entry) => [entry.osId, entry]),
          );
          correctiveRows.forEach((row) => {
            const entry = selectedById.get(String(row.id ?? "").trim());
            if (!entry) return;
            row.programacao_status = "em_programacao";
            row.programacao_periodo_inicio = entry.periodStart;
            row.programacao_periodo_fim = entry.periodEnd;
            row.programacao_dia_indice = entry.dayIndex;
            row.programacao_equipe = entry.equipe;
          });

          const filenameBase =
            slot.id === "CCH"
              ? "CIVIL"
              : slot.id === "REFRIG"
                ? "REFRIGERAÇÃO"
                : "ELÉTRICA";
          const id = `${slot.id}-${periodStart}-${Date.now()}-${weekIndex}`;
          const item: GeneratedFile = {
            id,
            filename: `${filenameBase} SEMANA ${week.isoWeek}.xlsx`,
            blob,
            week: week.isoWeek,
            slot: slot.id,
            slotLabel: slot.label,
            totalOS,
            preventiveCount,
            correctiveCount,
            remainingMinutes,
            periodStart,
            periodEnd,
          };
          output.push(item);
        }
      }

      // Commit único da programação corretiva. A função no banco usa locks e
      // aborta a transação inteira se alguma OS tiver sido programada por outra
      // sessão, concluída ou cancelada enquanto as planilhas eram montadas.
      try {
        const persisted = await registerCorrectiveProgrammingBatch(
          allCorrectiveProgrammingEntries,
        );
        if (persisted !== allCorrectiveProgrammingEntries.length) {
          throw new Error(
            `Foram selecionadas ${allCorrectiveProgrammingEntries.length} corretivas, mas somente ${persisted} foram registradas. Atualize e gere novamente.`,
          );
        }
      } catch (programStateError) {
        allCorrectiveProgrammingEntries.forEach((entry) =>
          releaseCorrectiveProgramReservation(entry.osId, entry.numeroOs),
        );
        throw programStateError;
      }

      // O histórico local das planilhas é auxiliar. Depois que o banco confirmou
      // o lote, uma falha ao salvar o arquivo no histórico não desfaz a programação.
      for (const item of output) {
        try {
          await saveHistorico({
            id: item.id,
            filename: item.filename,
            week: item.week,
            slot: item.slot,
            slotLabel: item.slotLabel,
            totalOS: item.totalOS,
            titulo: TITULO_PADRAO,
            createdAt: Date.now(),
            blob: item.blob,
            periodStart: item.periodStart,
            periodEnd: item.periodEnd,
            preventiveCount: item.preventiveCount,
            correctiveCount: item.correctiveCount,
            remainingMinutes: item.remainingMinutes,
          });
        } catch (historyError) {
          console.warn(
            `[Programacao] Não foi possível persistir ${item.filename} no histórico:`,
            historyError,
          );
        }
      }

      setAlerts(allAlerts);
      setStatusMessages(messages);
      setGenerated((current) => [...output, ...current]);
      await reloadHistorico();
      toast.success(
        `${output.length} planilha(s) semanal(is) gerada(s). Preventivas seguem Prédio → Andar → Local sem aleatoriedade; corretivas entram somente no final dos dias, priorizando backorders e urgências.`,
      );
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível gerar a programação. Verifique a planilha e o acesso às corretivas.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      downloadBlob(
        await generateBlankTemplate("GRUPO GPS"),
        "TEMPLATE_GRUPO_GPS.xlsx",
      );
    } catch (error) {
      console.error(error);
      toast.error("Falha ao gerar o modelo.");
    }
  };

  return (
    <PageShell
      title="Programação"
      description="Planejamento semanal sequencial por prédio e andar, com preventivas primeiro e corretivas priorizadas no final de cada dia."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="glass"
            onClick={() => void handleDownloadSla()}
            disabled={!hasAnyFile || slaProcessing}
            className="group h-10 rounded-xl border-amber-500/20 bg-amber-500/[0.04] px-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-500/40 hover:bg-amber-500/10 hover:shadow-md"
          >
            {slaProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="mr-2 h-4 w-4 text-amber-500 transition-transform duration-200 group-hover:scale-110" />
            )}
            Baixar Término SLA
          </Button>
          <Button
            variant="glass"
            onClick={downloadTemplate}
            className="group h-10 rounded-xl border-emerald-500/20 bg-emerald-500/[0.04] px-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:shadow-md"
          >
            <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-500 transition-transform duration-200 group-hover:scale-110" />
            Baixar modelo
          </Button>
        </div>
      }
    >
      <div className="space-y-6 pb-4">
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background/90 via-background/70 to-primary/[0.04] p-5 shadow-sm sm:p-6">
          <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-primary/[0.07] blur-3xl" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
                <Sparkles className="h-3.5 w-3.5" /> Central de planejamento PCM
              </div>
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Monte o mês com equilíbrio de capacidade e prioridade operacional
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Anexe as preventivas por grupo, defina o período e gere as semanas. Backorders e chamados mais urgentes entram primeiro, com distribuição de corretivas ao longo de segunda a sexta sempre que houver disponibilidade.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[500px]">
              <MetricCard icon={Clock3} value="09:00" label="Meta / equipe" />
              <MetricCard icon={ShieldCheck} value="2 / dia" label="Corretivas" />
              <MetricCard icon={Activity} value="Prioridade" label="Backorder + SLA" />
              <MetricCard icon={FileCheck2} value={`${attachedCount}/3`} label="Arquivos anexados" />
            </div>
          </div>
        </div>

        <GlassCard>
          <div className="space-y-5">
            <SectionHeading
              step="01"
              icon={Layers3}
              title="Planilhas mensais por equipe"
              description="Envie as planilhas de preventivas e confirme o tempo padrão por OS. A leitura e a distribuição existentes permanecem automáticas."
              aside={
                <Badge
                  variant="outline"
                  className="rounded-full border-primary/20 bg-primary/[0.04] px-3 py-1 text-[10px] font-semibold"
                >
                  {attachedCount === 0
                    ? "Aguardando arquivos"
                    : `${attachedCount} de 3 grupos preparados`}
                </Badge>
              }
            />

            <div className="grid gap-4 xl:grid-cols-3">
              {SLOTS.map((slot) => (
                <SlotUpload
                  key={slot.id}
                  slot={slot}
                  file={slotFiles[slot.id]}
                  onChange={(file) => setSlot(slot.id, file)}
                  minutes={tempoPorEquipe}
                  onMinutesChange={setTeamMinutes}
                />
              ))}
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="space-y-4">
              <SectionHeading
                step="02"
                icon={CalendarDays}
                title="Período da programação"
                description="Escolha a data inicial do mês. O sistema calcula as semanas úteis e mantém as regras atuais de capacidade e distribuição."
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "group h-auto min-h-14 w-full justify-start rounded-xl border-border/70 bg-background/60 px-4 py-3 text-left font-normal shadow-sm transition-all duration-200 hover:border-primary/35 hover:bg-accent/30 sm:w-[390px]",
                    )}
                  >
                    <span className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-105">
                      <CalendarIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Início da programação
                      </span>
                      <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">
                        {format(startDate, "EEEE, dd 'de' MMMM 'de' yyyy", {
                          locale: ptBR,
                        })}
                      </span>
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date: Date | undefined) => date && setStartDate(date)}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="min-w-0 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.07] to-primary/[0.02] p-4 lg:w-[390px]">
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Gauge className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Gerar programação semanal</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    Prioriza backorders e urgências e busca distribuir 1–2 corretivas por dia útil quando houver chamados elegíveis.
                  </p>
                </div>
              </div>
              <Button
                onClick={generate}
                disabled={!hasAnyFile || processing}
                className={cn(
                  "group h-12 w-full rounded-xl text-sm font-semibold shadow-sm transition-all duration-200",
                  hasAnyFile && !processing &&
                    "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10",
                )}
              >
                {processing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CalendarDays className="mr-2 h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                )}
                {processing ? "Montando o mês..." : "Gerar todas as semanas"}
                {!processing && <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />}
              </Button>
              {!hasAnyFile && (
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                  Anexe pelo menos uma planilha para habilitar a geração.
                </p>
              )}
            </div>
          </div>
        </GlassCard>

        {(alerts.length > 0 || statusMessages.length > 0) && (
          <GlassCard className="!p-3">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-1 py-1 outline-none">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/[0.07] text-primary">
                  <Activity className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold">Relatório da geração</span>
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                    Sequência de prédios, capacidade e corretivas priorizadas
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {alerts.length > 0 && (
                    <Badge variant="outline" className="rounded-full border-amber-500/25 px-2 text-[9px] text-amber-600 dark:text-amber-300">
                      {alerts.length} alerta(s)
                    </Badge>
                  )}
                  <Badge variant="outline" className="rounded-full px-2 text-[9px]">
                    {statusMessages.length} informação(ões)
                  </Badge>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
                </span>
              </summary>

              <div className="mt-3 grid gap-2 border-t border-border/40 pt-3 md:grid-cols-2">
                {alerts.map((alert) => (
                  <div
                    key={`${alert.arquivo}-${alert.real}`}
                    className="flex items-start gap-2 rounded-lg border border-amber-500/15 bg-amber-500/[0.05] p-2.5"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <p className="text-[10px] leading-4 text-muted-foreground">
                      <strong className="text-foreground">{alert.arquivo}</strong>: conteúdo identificado como {alert.real}.
                    </p>
                  </div>
                ))}
                {statusMessages.map((message, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-2 rounded-lg border border-border/40 bg-background/30 p-2.5"
                  >
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    <p className="text-[10px] leading-4 text-muted-foreground">{message}</p>
                  </div>
                ))}
              </div>
            </details>
          </GlassCard>
        )}

        {generated.length > 0 && (
          <GlassCard>
            <div className="space-y-4">
              <SectionHeading
                step="04"
                icon={FileCheck2}
                title="Planilhas prontas"
                description="Arquivos semanais gerados e prontos para download ou impressão."
                aside={
                  <Badge className="rounded-full px-3 py-1 text-[10px]">
                    {generated.length} arquivo(s)
                  </Badge>
                }
              />
              <div className="grid gap-3 xl:grid-cols-2">
                {generated.map((file) => (
                  <div
                    key={file.id}
                    className="group relative overflow-hidden rounded-2xl border border-border/60 bg-background/40 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-background/60 hover:shadow-md"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/15 bg-emerald-500/[0.07] text-emerald-500">
                        <FileSpreadsheet className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm font-semibold" title={file.filename}>
                            {file.filename}
                          </p>
                          <Badge variant="outline" className="shrink-0 rounded-full text-[9px]">
                            Semana {file.week}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">
                          {file.slotLabel}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <ResultChip label="Preventivas" value={file.preventiveCount} />
                          <ResultChip label="Corretivas" value={file.correctiveCount} emphasis />
                          <ResultChip label="Saldo" value={formatMinutes(file.remainingMinutes)} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button
                        variant="secondary"
                        className="h-10 rounded-xl transition-all duration-200 hover:bg-accent"
                        onClick={() => downloadBlob(file.blob, file.filename)}
                      >
                        <Download className="mr-2 h-4 w-4" /> Baixar
                      </Button>
                      <Button
                        className="h-10 rounded-xl transition-all duration-200"
                        onClick={() => void handlePrint(file.blob)}
                      >
                        <Printer className="mr-2 h-4 w-4" /> Imprimir
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>
        )}

        <GlassCard>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SectionHeading
                icon={History}
                title="Histórico semanal"
                description="Arquivos persistentes na sua conta. Atualize a página ou apague o download do computador e baixe novamente quando precisar."
              />
              {historico.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="self-start rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive sm:self-auto"
                  onClick={async () => {
                    if (!window.confirm("Limpar todo o histórico de programações?")) return;
                    await clearHistorico();
                    await reloadHistorico();
                  }}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Limpar histórico
                </Button>
              )}
            </div>

            {historyGroups.length === 0 ? (
              <div className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-background/25 px-4 py-8 text-center">
                <History className="mb-3 h-6 w-6 text-muted-foreground/50" />
                <p className="text-sm font-medium">Nenhuma programação no histórico</p>
                <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
                  Quando você gerar uma programação, a planilha será salva na nuvem da sua conta para download e impressão futura.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {historyGroups.map(([group, items]) => (
                  <details
                    key={group}
                    className="group overflow-hidden rounded-2xl border border-border/60 bg-background/30 transition-all duration-200 open:border-primary/20 open:bg-background/45"
                    open={historyGroups.length <= 2}
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 outline-none transition-colors hover:bg-accent/25 focus-visible:ring-2 focus-visible:ring-primary/40">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
                        <CalendarDays className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">Semana {items[0].week}</span>
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                          {items[0].periodStart ?? "arquivo anterior"} a {items[0].periodEnd ?? "—"}
                        </span>
                      </span>
                      <Badge variant="outline" className="hidden gap-1 rounded-full border-emerald-500/20 text-[9px] text-emerald-600 sm:inline-flex dark:text-emerald-300">
                        <Cloud className="h-3 w-3" />
                        Salvo
                      </Badge>
                      <Badge variant="outline" className="rounded-full text-[9px]">
                        {items.length} arquivo(s)
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-90" />
                    </summary>
                    <div className="grid gap-2 border-t border-border/50 p-3 xl:grid-cols-2">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-col gap-3 rounded-xl border border-border/40 bg-background/50 p-3 transition-colors duration-200 hover:bg-background/70 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <p className="truncate text-xs font-semibold">{item.slotLabel}</p>
                              <span
                                className={cn(
                                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide",
                                  item.persistent !== false
                                    ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-600 dark:text-emerald-300"
                                    : "border-amber-500/20 bg-amber-500/[0.05] text-amber-600 dark:text-amber-300",
                                )}
                              >
                                <Cloud className="h-2.5 w-2.5" />
                                {item.persistent !== false ? "Nuvem" : "Local"}
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              <ResultChip label="Prev." value={item.preventiveCount ?? item.totalOS} compact />
                              <ResultChip label="Corr." value={item.correctiveCount ?? 0} compact emphasis />
                              <ResultChip label="Saldo" value={formatMinutes(item.remainingMinutes ?? 0)} compact />
                            </div>
                          </div>
                          <div className="grid shrink-0 grid-cols-3 gap-1.5 sm:flex">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="rounded-lg"
                              disabled={historyBusyId === item.id}
                              onClick={() => void handleHistoryDownload(item)}
                              aria-label="Baixar"
                              title="Baixar arquivo"
                            >
                              {historyBusyId === item.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              className="rounded-lg"
                              disabled={historyBusyId === item.id}
                              onClick={() => void handleHistoryPrint(item)}
                              aria-label="Imprimir"
                              title="Imprimir programação"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              onClick={async () => {
                                await deleteHistorico(item);
                                await reloadHistorico();
                              }}
                              aria-label="Excluir"
                              title="Excluir do histórico"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        </GlassCard>
      </div>
    </PageShell>
  );
}

interface SectionHeadingProps {
  step?: string;
  icon: typeof Activity;
  title: string;
  description: string;
  aside?: React.ReactNode;
}

function SectionHeading({ step, icon: Icon, title, description, aside }: SectionHeadingProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/[0.06] text-primary">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {step && (
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary/80">
                Etapa {step}
              </span>
            )}
          </div>
          <h3 className="mt-0.5 text-sm font-semibold tracking-tight sm:text-base">{title}</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}

interface MetricCardProps {
  icon: typeof Activity;
  value: string;
  label: string;
}

function MetricCard({ icon: Icon, value, label }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/55 p-3 shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-background/70">
      <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-primary/[0.07] text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <p className="text-sm font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

interface ResultChipProps {
  label: string;
  value: string | number;
  compact?: boolean;
  emphasis?: boolean;
}

function ResultChip({ label, value, compact, emphasis }: ResultChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px]",
        compact && "px-2 py-0.5 text-[9px]",
        emphasis
          ? "border-rose-500/15 bg-rose-500/[0.05] text-rose-600 dark:text-rose-300"
          : "border-border/50 bg-background/55 text-muted-foreground",
      )}
    >
      <span>{label}</span>
      <strong className="font-semibold text-foreground">{value}</strong>
    </span>
  );
}

interface SlotUploadProps {
  slot: SlotDef;
  file: File | null;
  onChange: (file: File | null) => void;
  minutes: Record<Equipe, 30 | 60>;
  onMinutesChange: (equipe: Equipe, minutes: 30 | 60) => void;
}

function SlotUpload({
  slot,
  file,
  onChange,
  minutes,
  onMinutesChange,
}: SlotUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const SlotIcon = slot.id === "REFRIG" ? Snowflake : slot.id === "ELETRICA" ? Zap : Building2;

  return (
    <div
      className="group relative flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/40 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-background/55 hover:shadow-md"
      style={{ boxShadow: `inset 0 3px 0 ${slot.color}` }}
    >
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-[0.08] blur-3xl"
        style={{ backgroundColor: slot.color }}
      />

      <div className="relative flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-background/70"
          style={{ borderColor: `${slot.color}33`, color: slot.color }}
        >
          <SlotIcon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold tracking-tight">{slot.label}</p>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold",
                file
                  ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-600 dark:text-emerald-300"
                  : "border-border/50 bg-background/60 text-muted-foreground",
              )}
            >
              {file ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Upload className="h-2.5 w-2.5" />}
              {file ? "Arquivo anexado" : "Aguardando arquivo"}
            </span>
          </div>
          <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">{slot.hint}</p>
        </div>
      </div>

      <div className="relative mt-4 space-y-2">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Tempo padrão por OS
        </p>
        {slot.equipes.map((equipe) => (
          <div
            key={equipe}
            className="flex items-center justify-between gap-2 rounded-xl border border-border/45 bg-background/45 px-3 py-2.5 transition-colors duration-200 hover:bg-background/65"
          >
            <span
              className="min-w-0 truncate text-[10px] font-semibold"
              style={{ color: EQUIPE_COLOR[equipe] }}
              title={equipe}
            >
              {equipe}
            </span>
            <div className="inline-flex shrink-0 rounded-lg border border-border/60 bg-background/60 p-0.5 shadow-inner">
              {([30, 60] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onMinutesChange(equipe, value)}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 font-mono text-[10px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    minutes[equipe] === value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                  aria-pressed={minutes[equipe] === value}
                >
                  {value === 30 ? "00:30" : "01:00"}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="relative mt-auto pt-4">
        {file ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.045] p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <FileCheck2 className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold" title={file.name}>{file.name}</p>
              <p className="mt-0.5 text-[9px] text-muted-foreground">Planilha pronta para processamento</p>
            </div>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label="Remover arquivo"
              title="Remover arquivo"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) onChange(dropped);
            }}
            className="group/upload flex min-h-20 w-full items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-background/30 px-4 py-3 text-left transition-all duration-200 hover:border-primary/35 hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/[0.06] text-primary transition-transform duration-200 group-hover/upload:-translate-y-0.5 group-hover/upload:scale-105">
              <Upload className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-[11px] font-semibold text-foreground">Anexar OS do mês</span>
              <span className="mt-0.5 block text-[9px] text-muted-foreground">Clique ou arraste um arquivo .xlsx</span>
            </span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
}
