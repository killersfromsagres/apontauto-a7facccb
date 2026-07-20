import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarIcon, Download, FileSpreadsheet, History, Trash2, Upload, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { readPreventivaFiles, type FileAlert } from "@/lib/preventiva/reader";
import {
  triage,
  EQUIPE_COLOR,
  REFRIG_1,
  REFRIG_2,
  REFRIG_3,
  type Equipe,
  type TriagedOS,
} from "@/lib/preventiva/triage";
import {
  distributeAcrossMonth,
  weeksToCoverAll,
  MINUTOS_UTEIS_DIA,
  type WeekBucket,
} from "@/lib/preventiva/capacity";
import { generateWeeklyProgramacao } from "@/lib/preventiva/weekly-exporter";
import { generateBlankTemplate } from "@/lib/preventiva/blank-templates";
import { downloadBlob } from "@/lib/download";
import {
  clearHistorico,
  deleteHistorico,
  listHistorico,
  saveHistorico,
  type HistoricoItem,
} from "@/lib/preventiva/history";

export const Route = createFileRoute("/_authenticated/programacao")({
  component: ProgramacaoPage,
});


type SlotId = "CCH" | "REFRIG" | "ELETRICA";

interface SlotDef {
  id: SlotId;
  label: string;
  hint: string;
  color: string;
  equipes: Equipe[]; // equipes que serão geradas por esse slot
  minutosPorOS: number; // duração estimada por OS
}

const SLOTS: SlotDef[] = [
  {
    id: "CCH",
    label: "CIVIL / CHAVEIRO / HIDRÁULICA",
    hint: "Base 01:00/OS · +00:30 por incremento (alerta).",
    color: EQUIPE_COLOR.CIVIL,
    equipes: ["CHAVEIRO", "CIVIL", "HIDRÁULICA"],
    minutosPorOS: 60,
  },
  {
    id: "REFRIG",
    label: "CLIMATIZAÇÃO E REFRIGERAÇÃO",
    hint: "60 min/OS · até 8/dia · separa Equipe 1/2/3 por prédio.",
    color: EQUIPE_COLOR["CLIMATIZAÇÃO E REFRIGERAÇÃO 1"],
    equipes: [
      "CLIMATIZAÇÃO E REFRIGERAÇÃO 1",
      "CLIMATIZAÇÃO E REFRIGERAÇÃO 2",
      "CLIMATIZAÇÃO E REFRIGERAÇÃO 3",
    ],
    minutosPorOS: 60,
  },
  {
    id: "ELETRICA",
    label: "ELÉTRICA",
    hint: "30 min/OS · até 16/dia (8h por técnico).",
    color: EQUIPE_COLOR.ELÉTRICA,
    equipes: ["ELÉTRICA"],
    minutosPorOS: 30,
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
}

const TITULO_PADRAO = "SHERWIN WILLIAMS / DEMARCHI";

const norm = (v: unknown) =>
  String(v ?? "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function predioMatches(predio: string, arr: string[]): boolean {
  const p = norm(predio);
  return arr.some((x) => norm(x) === p || p.startsWith(norm(x)));
}

function filterForSlot(all: TriagedOS[], slot: SlotId): TriagedOS[] {
  switch (slot) {
    case "CCH":
      return all.filter((o) =>
        o.equipe === "CIVIL" || o.equipe === "CHAVEIRO" || o.equipe === "HIDRÁULICA",
      );
    case "REFRIG": {
      const climat = all.filter((o) => o.equipe.startsWith("CLIMAT"));
      const out: TriagedOS[] = [];
      for (const o of climat) {
        if (predioMatches(o.predio, REFRIG_1)) {
          out.push({ ...o, equipe: "CLIMATIZAÇÃO E REFRIGERAÇÃO 1" as Equipe });
        } else if (predioMatches(o.predio, REFRIG_2)) {
          out.push({ ...o, equipe: "CLIMATIZAÇÃO E REFRIGERAÇÃO 2" as Equipe });
        } else if (predioMatches(o.predio, REFRIG_3)) {
          out.push({ ...o, equipe: "CLIMATIZAÇÃO E REFRIGERAÇÃO 3" as Equipe });
        }
      }
      return out;
    }
    case "ELETRICA":
      return all.filter((o) => o.equipe === "ELÉTRICA");
  }
}

function ProgramacaoPage() {
  const [slotFiles, setSlotFiles] = useState<Record<SlotId, File | null>>({
    CCH: null,
    REFRIG: null,
    ELETRICA: null,
  });
  const [processing, setProcessing] = useState(false);
  const [generated, setGenerated] = useState<GeneratedFile[]>([]);
  const [alerts, setAlerts] = useState<FileAlert[]>([]);
  const [overflowMsgs, setOverflowMsgs] = useState<string[]>([]);
  // Tempo por OS (minutos). Intervalo permitido: 30 (00:30) ou 60 (01:00).
  const [tempoPorOS, setTempoPorOS] = useState<Record<SlotId, 30 | 60>>({
    CCH: 60,
    REFRIG: 60,
    ELETRICA: 30,
  });
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  });


  const reloadHistorico = useCallback(async () => {
    try {
      setHistorico(await listHistorico());
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    void reloadHistorico();
  }, [reloadHistorico]);

  const setTempo = useCallback((slot: SlotId, minutos: 30 | 60) => {
    setTempoPorOS((prev) => {
      if (prev[slot] === minutos) return prev;
      return { ...prev, [slot]: minutos };
    });
  }, []);

  const setSlot = useCallback((slot: SlotId, file: File | null) => {
    if (file && !file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Envie um arquivo .xlsx");
      return;
    }
    setSlotFiles((prev) => ({ ...prev, [slot]: file }));
  }, []);

  const hasAnyFile = useMemo(
    () => Object.values(slotFiles).some(Boolean),
    [slotFiles],
  );

  const generate = async () => {
    if (!hasAnyFile) return toast.error("Anexe pelo menos um arquivo");
    setProcessing(true);
    setAlerts([]);
    setOverflowMsgs([]);
    try {
      const semanas = weeksUntilEndOfMonth(new Date());
      const out: GeneratedFile[] = [];
      const allAlerts: FileAlert[] = [];
      const overflowList: string[] = [];

      for (const slot of SLOTS) {
        const file = slotFiles[slot.id];
        if (!file) continue;

        const read = await readPreventivaFiles([file]);
        allAlerts.push(...read.alerts);
        const triaged = triage(read.rows);
        const filtered = filterForSlot(triaged, slot.id);

        if (filtered.length === 0) {
          toast.warning(`${slot.label}: nenhuma OS reconhecida no arquivo.`);
          continue;
        }

        // Distribui cada equipe do slot balanceando por dias úteis do mês,
        // com sequenciamento por prédio → andar (minimiza deslocamento).
        const now = new Date();
        const minEffective = tempoPorOS[slot.id] ?? slot.minutosPorOS;
        const porEquipeBuckets = new Map<Equipe, ReturnType<typeof distributeAcrossMonth>>();
        for (const eq of slot.equipes) {
          const osEq = filtered.filter((o) => o.equipe === eq);
          if (osEq.length > 0) {
            porEquipeBuckets.set(
              eq,
              distributeAcrossMonth(osEq, semanas, {
                from: now,
                minutosPorOS: minEffective,
              }),
            );
          }
        }

        let overflowTotal = 0;
        let overflowPerDay = 0;
        let overflowCap = 0;
        let overflowDias = 0;
        let overflowTotalOS = 0;
        for (let i = 0; i < semanas.length; i++) {
          const week = semanas[i];
          const bucketsPorEquipe = new Map<Equipe, WeekBucket>();
          let totalSemana = 0;
          for (const eq of slot.equipes) {
            const sliced = porEquipeBuckets.get(eq);
            if (!sliced) continue;
            const b = sliced.buckets[i];
            if (b && b.os.length > 0) {
              bucketsPorEquipe.set(eq, b);
              totalSemana += b.os.length;
            }
          }
          if (totalSemana === 0) continue;
          const blob = await generateWeeklyProgramacao({
            titulo: TITULO_PADRAO,
            week,
            bucketsPorEquipe,
            ativoIndex: read.ativoIndex,
          });
          const slug = slot.label.replace(/[^A-Z0-9]+/gi, "_");
          const item: GeneratedFile = {
            id: `${slot.id}-${week.isoWeek}-${Date.now()}-${i}`,
            filename: `PROGRAMACAO_SEM${week.isoWeek}_${slug}.xlsx`,
            blob,
            week: week.isoWeek,
            slot: slot.id,
            slotLabel: slot.label,
            totalOS: totalSemana,
          };
          out.push(item);
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
              blob,
            });
          } catch (err) {
            console.error("Falha ao salvar histórico", err);
          }
        }
        for (const eq of slot.equipes) {
          const d = porEquipeBuckets.get(eq);
          if (!d) continue;
          overflowTotal += d.overflow.length;
          overflowPerDay = Math.max(overflowPerDay, d.perDay);
          overflowCap = Math.max(overflowCap, d.capPerDay);
          overflowDias = d.businessDaysCount;
          overflowTotalOS += d.buckets.reduce((s, b) => s + b.os.length, 0) + d.overflow.length;
        }
        if (overflowTotal > 0) {
          overflowList.push(
            `${slot.label}: ${overflowTotal} OS não cabem até o fim do mês. ` +
              `Total ${overflowTotalOS} OS ÷ ${overflowDias} dias úteis = ${Math.ceil(
                overflowTotalOS / Math.max(1, overflowDias),
              )}/dia, mas a capacidade máxima é ${overflowCap}/dia (usando ${overflowPerDay}/dia).`,
          );
        } else if (overflowPerDay > 0) {
          overflowList.push(
            `${slot.label}: ${overflowTotalOS} OS distribuídas em ${overflowDias} dias úteis (${overflowPerDay}/dia), sequenciadas por prédio → andar.`,
          );
        }

      }

      setAlerts(allAlerts);
      setOverflowMsgs(overflowList);
      setGenerated((prev) => [...out, ...prev]);
      if (out.length > 0) void reloadHistorico();
      if (out.length === 0) toast.warning("Nenhum arquivo semanal foi gerado.");
      else toast.success(`${out.length} arquivo(s) semanal(is) gerado(s)`);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao processar os arquivos");
    } finally {
      setProcessing(false);
    }
  };

  const downloadTemplate = async (titulo: string) => {
    try {
      const blob = await generateBlankTemplate(titulo);
      const slug = titulo.replace(/[^A-Z0-9]+/gi, "_");
      downloadBlob(blob, `TEMPLATE_${slug}.xlsx`);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao gerar template");
    }
  };

  return (
    <PageShell
      title="Programação Semanal"
      description="Anexe um arquivo por equipe (Civil/Chaveiro/Hidráulica é unificado) e gere as programações semanais até o fim do mês."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => downloadTemplate("GRUPO GPS")}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Template GPS
          </Button>
          <Button variant="outline" onClick={() => downloadTemplate(TITULO_PADRAO)}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Template Sherwin
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Campo 1 — 5 slots de upload */}
        <GlassCard>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                1 · Anexar planilhas por equipe
              </h3>
              <span className="text-[11px] text-muted-foreground">
                A Categoria é lida linha a linha — o nome do arquivo é ignorado.
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {SLOTS.map((slot) => (
                <SlotUpload
                  key={slot.id}
                  slot={slot}
                  file={slotFiles[slot.id]}
                  onChange={(f) => setSlot(slot.id, f)}
                  minutos={tempoPorOS[slot.id]}
                  onMinutosChange={(m) => setTempo(slot.id, m)}
                />
              ))}
            </div>

            <Button
              onClick={generate}
              disabled={processing || !hasAnyFile}
              className="w-full sm:w-auto"
              size="lg"
            >
              {processing ? "Processando…" : "Gerar Programação"}
            </Button>

            {alerts.length > 0 && (
              <div className="space-y-2">
                {alerts.map((a) => (
                  <div
                    key={a.arquivo}
                    className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div>
                      <strong>{a.arquivo}</strong> foi enviado como{" "}
                      <em>{a.esperado}</em> mas contém {Math.round(a.percentual * 100)}% de{" "}
                      <em>{a.real}</em>. Os dados foram reclassificados automaticamente.
                    </div>
                  </div>
                ))}
              </div>
            )}

            {overflowMsgs.length > 0 && (
              <div className="space-y-2">
                {overflowMsgs.map((m, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs"
                  >
                    {m}
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassCard>

        {/* Campo 2 — Downloads */}
        <GlassCard>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                2 · Arquivos gerados
              </h3>
              {generated.length > 0 && (
                <button
                  onClick={() => setGenerated([])}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Limpar
                </button>
              )}
            </div>

            {generated.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/50 py-12 text-center text-muted-foreground">
                <FileSpreadsheet className="h-6 w-6" />
                <p className="text-xs">Nenhum arquivo gerado ainda.</p>
              </div>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {generated.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        Semana {f.week} · {f.slotLabel}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {f.totalOS} OS · {f.filename}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => downloadBlob(f.blob, f.filename)}
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" /> Baixar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </GlassCard>

        {/* Campo 3 — Histórico persistente */}
        <GlassCard>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  3 · Histórico de programações
                </h3>
                {historico.length > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    {historico.length}
                  </Badge>
                )}
              </div>
              {historico.length > 0 && (
                <button
                  onClick={async () => {
                    if (!confirm("Apagar todo o histórico local?")) return;
                    await clearHistorico();
                    await reloadHistorico();
                    toast.success("Histórico limpo");
                  }}
                  className="text-[11px] text-muted-foreground hover:text-destructive"
                >
                  Limpar histórico
                </button>
              )}
            </div>

            {historico.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/50 py-12 text-center text-muted-foreground">
                <History className="h-6 w-6" />
                <p className="text-xs">
                  Programações geradas aparecerão aqui e ficam salvas no navegador.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(
                  historico.reduce<Record<string, HistoricoItem[]>>((acc, it) => {
                    const key = `Semana ${it.week}`;
                    (acc[key] ||= []).push(it);
                    return acc;
                  }, {}),
                ).map(([label, items]) => (
                  <div key={label} className="space-y-2">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <span className="font-semibold">{label}</span>
                      <span className="h-px flex-1 bg-border/50" />
                      <span>{items.length} arquivo{items.length === 1 ? "" : "s"}</span>
                    </div>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {items.map((f) => (
                        <li
                          key={f.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/40 p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{f.slotLabel}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {f.totalOS} OS ·{" "}
                              {new Date(f.createdAt).toLocaleString("pt-BR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </p>
                            <p className="truncate text-[10px] text-muted-foreground/70">
                              {f.filename}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => downloadBlob(f.blob, f.filename)}
                            >
                              <Download className="mr-1.5 h-3.5 w-3.5" /> Baixar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                await deleteHistorico(f.id);
                                await reloadHistorico();
                              }}
                              aria-label="Excluir do histórico"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
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
  minutos: 30 | 60;
  onMinutosChange: (minutos: 30 | 60) => void;
}

function SlotUpload({ slot, file, onChange, minutos, onMinutosChange }: SlotUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fmt = (m: number) => (m === 60 ? "01:00" : "00:30");

  return (
    <div
      className="relative flex flex-col gap-2 overflow-hidden rounded-xl border border-border/60 bg-background/40 p-3"
      style={{ boxShadow: `inset 4px 0 0 0 ${slot.color}` }}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-sm"
          style={{ background: slot.color }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{slot.label}</p>
          <p className="truncate text-[10px] text-muted-foreground">{slot.hint}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/50 px-2 py-1.5 text-[11px]">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Tempo/OS
          </span>
          <span className="font-mono">{fmt(minutos)}</span>
        </div>
        <div className="inline-flex overflow-hidden rounded-md border border-border/60">
          <button
            type="button"
            onClick={() => onMinutosChange(30)}
            className={`px-2 py-1 text-[11px] font-mono transition-colors ${
              minutos === 30
                ? "bg-primary text-primary-foreground"
                : "bg-background/60 text-muted-foreground hover:bg-accent/40"
            }`}
            aria-pressed={minutos === 30}
          >
            00:30
          </button>
          <button
            type="button"
            onClick={() => onMinutosChange(60)}
            className={`border-l border-border/60 px-2 py-1 text-[11px] font-mono transition-colors ${
              minutos === 60
                ? "bg-primary text-primary-foreground"
                : "bg-background/60 text-muted-foreground hover:bg-accent/40"
            }`}
            aria-pressed={minutos === 60}
          >
            01:00
          </button>
        </div>
      </div>
      {minutos !== slot.minutosPorOS && (
        <div className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3" />
          Tempo/OS ajustado (padrão {fmt(slot.minutosPorOS)}).
        </div>
      )}


      {file ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/60 px-2 py-1.5 text-[11px]">
          <span className="truncate" title={file.name}>
            {file.name}
          </span>
          <button
            onClick={() => onChange(null)}
            className="opacity-60 hover:opacity-100"
            aria-label="Remover arquivo"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) onChange(f);
          }}
          className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border/60 px-3 py-2 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/30"
        >
          <Upload className="h-3.5 w-3.5" />
          Anexar .xlsx
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
