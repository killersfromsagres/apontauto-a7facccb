import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  CalendarIcon,
  Download,
  FileSpreadsheet,
  History,
  Loader2,
  Printer,
  Trash2,
  Upload,
  X,
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
import { weeksBetween, type WeekBucket } from "@/lib/preventiva/capacity";
import { getLatestCorretivas } from "@/lib/preventiva/corretivas.functions";
import {
  clearHistorico,
  deleteHistorico,
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
import {
  generateWeeklyProgramacao,
  printWeeklyProgramacao,
} from "@/lib/preventiva/weekly-exporter";

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
    label: "CIVIL / CHAVEIRO / HIDRÁULICA",
    hint: "Padrões independentes: Chaveiro e Civil 00:30; Hidráulica 01:00.",
    color: EQUIPE_COLOR.CIVIL,
    equipes: ["CHAVEIRO", "CIVIL", "HIDRÁULICA"],
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
      ["CIVIL", "CHAVEIRO", "HIDRÁULICA"].includes(item.equipe),
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
      await printWeeklyProgramacao(blob);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao preparar a impressão",
      );
    }
  }, []);

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
      const correctiveMap = mapCorrectives(correctiveRows, startDate);
      const output: GeneratedFile[] = [];
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
            `${slot.label}: nenhuma preventiva reconhecida; as semanas mostram corretivas e saldos pendentes.`,
          );
        }

        const schedules = new Map<Equipe, TeamMonthlySchedule>();
        for (const equipe of slot.equipes) {
          const schedule = scheduleTeamMonth({
            equipe,
            preventivas: preventiveItems.filter(
              (item) => item.equipe === equipe,
            ),
            corretivas: correctiveMap.items.filter(
              (item) => item.equipe === equipe,
            ),
            weeks,
            from: startDate,
            until: monthEnd,
            minutosPorOS: tempoPorEquipe[equipe],
          });
          schedules.set(equipe, schedule);

          const allLoads = schedule.loadsByWeek.flat();
          const remaining = allLoads.reduce(
            (total, load) => total + load.remainingMinutes,
            0,
          );
          const deficitDays = allLoads.filter(
            (load) => load.correctiveDeficit > 0,
          ).length;
          messages.push(
            `${equipe}: ${schedule.scheduledPreventivas} preventiva(s) + ${schedule.scheduledCorretivas} corretiva(s); ` +
              `saldo mensal a apontar ${formatMinutes(remaining)}${deficitDays ? `; ${deficitDays} dia(s) sem duas corretivas disponíveis` : ""}.`,
          );
          if (
            schedule.overflowPreventivas.length ||
            schedule.overflowCorretivas.length
          ) {
            messages.push(
              `${equipe}: excedente de ${schedule.overflowPreventivas.length} preventiva(s) e ${schedule.overflowCorretivas.length} corretiva(s) após preencher 09:00 em todos os dias úteis.`,
            );
          }
        }

        for (let weekIndex = 0; weekIndex < weeks.length; weekIndex += 1) {
          const week = weeks[weekIndex];
          const bucketsPorEquipe = new Map<Equipe, WeekBucket>();
          const cargasPorEquipe = new Map<Equipe, DailyTeamLoad[]>();
          for (const equipe of slot.equipes) {
            const schedule = schedules.get(equipe);
            if (!schedule) continue;
            bucketsPorEquipe.set(equipe, schedule.buckets[weekIndex]);
            cargasPorEquipe.set(equipe, schedule.loadsByWeek[weekIndex]);
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
          const blob = await generateWeeklyProgramacao({
            titulo: TITULO_PADRAO,
            week,
            bucketsPorEquipe,
            cargasPorEquipe,
            minutosPorEquipe: tempoPorEquipe,
            ativoIndex: read.ativoIndex,
          });
          const periodStart = isoLocal(week.monday);
          const periodEnd = isoLocal(week.friday);
          const monthSlug = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`;
          const slotSlug = slot.id === "REFRIG" ? "REFRIGERACAO" : slot.id;
          const id = `${slot.id}-${periodStart}-${Date.now()}-${weekIndex}`;
          const item: GeneratedFile = {
            id,
            filename: `PROGRAMACAO_${monthSlug}_SEM${week.isoWeek}_${slotSlug}.xlsx`,
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
          await saveHistorico({
            id,
            filename: item.filename,
            week: item.week,
            slot: item.slot,
            slotLabel: item.slotLabel,
            totalOS,
            titulo: TITULO_PADRAO,
            createdAt: Date.now(),
            blob,
            periodStart,
            periodEnd,
            preventiveCount,
            correctiveCount,
            remainingMinutes,
          });
        }
      }

      setAlerts(allAlerts);
      setStatusMessages(messages);
      setGenerated((current) => [...output, ...current]);
      await reloadHistorico();
      toast.success(
        `${output.length} planilha(s) semanal(is) gerada(s) para o mês.`,
      );
    } catch (error) {
      console.error(error);
      toast.error(
        "Não foi possível gerar a programação. Verifique a planilha e o acesso às corretivas.",
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
      description="Programação mensal em semanas, com meta diária de 09:00 e corretivas abertas integradas automaticamente."
      actions={
        <Button
          variant="glass"
          onClick={downloadTemplate}
          className="h-9 border-emerald-500/20 hover:bg-emerald-500/10"
        >
          <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-500" /> Baixar
          modelo da programação
        </Button>
      }
    >
      <div className="space-y-6">
        <GlassCard>
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  1 · Planilhas mensais por equipe
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  As corretivas vêm de Corretiva › Novo › Programação de
                  Corretivas; não é necessário importá-las.
                </p>
              </div>
              <Badge variant="outline">2 corretivas/dia • 09:00/equipe</Badge>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Início da programação no mês
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal sm:w-[290px]",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(startDate, "EEEE, dd 'de' MMMM 'de' yyyy", {
                        locale: ptBR,
                      })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={(date: Date | undefined) =>
                        date && setStartDate(date)
                      }
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                onClick={generate}
                disabled={!hasAnyFile || processing}
                className="min-w-[220px]"
              >
                {processing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CalendarIcon className="mr-2 h-4 w-4" />
                )}
                {processing ? "Montando o mês..." : "Gerar todas as semanas"}
              </Button>
            </div>
          </div>
        </GlassCard>

        {(alerts.length > 0 || statusMessages.length > 0) && (
          <GlassCard>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">
                Relatório de capacidade e triagem
              </h3>
              {alerts.map((alert) => (
                <p
                  key={`${alert.arquivo}-${alert.real}`}
                  className="flex gap-2 text-xs text-amber-600 dark:text-amber-400"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{" "}
                  {alert.arquivo}: conteúdo identificado como {alert.real}.
                </p>
              ))}
              {statusMessages.map((message, index) => (
                <p key={index} className="text-xs text-muted-foreground">
                  {message}
                </p>
              ))}
            </div>
          </GlassCard>
        )}

        {generated.length > 0 && (
          <GlassCard>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Planilhas prontas para baixar e imprimir
              </h3>
              <div className="grid gap-2 md:grid-cols-2">
                {generated.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/40 p-3"
                  >
                    <div className="min-w-0">
                      <p
                        className="truncate text-xs font-semibold"
                        title={file.filename}
                      >
                        {file.filename}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {file.preventiveCount} preventivas •{" "}
                        {file.correctiveCount} corretivas • falta{" "}
                        {formatMinutes(file.remainingMinutes)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => downloadBlob(file.blob, file.filename)}
                      >
                        <Download className="mr-1 h-3.5 w-3.5" /> Baixar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void handlePrint(file.blob)}
                      >
                        <Printer className="mr-1 h-3.5 w-3.5" /> Imprimir
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>
        )}

        <GlassCard>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4" />
                <h3 className="text-sm font-semibold">Histórico semanal</h3>
              </div>
              {historico.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "Limpar todo o histórico de programações?",
                      )
                    )
                      return;
                    await clearHistorico();
                    await reloadHistorico();
                  }}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Limpar
                </Button>
              )}
            </div>
            {historyGroups.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma programação gerada neste navegador.
              </p>
            ) : (
              <div className="space-y-2">
                {historyGroups.map(([group, items]) => (
                  <details
                    key={group}
                    className="rounded-xl border border-border/60 bg-background/30"
                    open={historyGroups.length <= 2}
                  >
                    <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">
                      Semana {items[0].week} •{" "}
                      {items[0].periodStart ?? "arquivo anterior"} a{" "}
                      {items[0].periodEnd ?? "—"} • {items.length} arquivo(s)
                    </summary>
                    <div className="grid gap-2 border-t border-border/50 p-2 lg:grid-cols-2">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-2 rounded-lg bg-background/50 p-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-medium">
                              {item.slotLabel}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {item.preventiveCount ?? item.totalOS} prev. •{" "}
                              {item.correctiveCount ?? 0} corr. • falta{" "}
                              {formatMinutes(item.remainingMinutes ?? 0)}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                downloadBlob(item.blob, item.filename)
                              }
                              aria-label="Baixar"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => void handlePrint(item.blob)}
                              aria-label="Imprimir"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                await deleteHistorico(item.id);
                                await reloadHistorico();
                              }}
                              aria-label="Excluir"
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
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/40 p-3"
      style={{ boxShadow: `inset 4px 0 0 ${slot.color}` }}
    >
      <div>
        <p className="text-xs font-semibold">{slot.label}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{slot.hint}</p>
      </div>
      <div className="space-y-1.5">
        {slot.equipes.map((equipe) => (
          <div
            key={equipe}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/50 px-2 py-1.5"
          >
            <span
              className="min-w-0 truncate text-[10px] font-semibold"
              style={{ color: EQUIPE_COLOR[equipe] }}
            >
              {equipe}
            </span>
            <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border/60">
              {([30, 60] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onMinutesChange(equipe, value)}
                  className={cn(
                    "px-2 py-1 font-mono text-[10px]",
                    value === 60 && "border-l border-border/60",
                    minutes[equipe] === value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent/40",
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
      {file ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/60 px-2 py-2 text-[11px]">
          <span className="truncate" title={file.name}>
            {file.name}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remover arquivo"
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
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 text-[11px] text-muted-foreground hover:border-primary/50 hover:bg-accent/30"
        >
          <Upload className="h-3.5 w-3.5" /> Anexar OS do mês (.xlsx)
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
  );
}
