import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { toast } from "sonner";
import { CalendarDays, CloudRain, Download, Gauge, Radio, RefreshCw } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/pcm";
import { cn } from "@/lib/utils";
import { downloadBlob } from "@/lib/download";
import {
  registrarChuvaManual,
  listObservations,
  listEvents,
  listSourceHealth,
  aggregateByDay,
  aggregateByHour,
  type WeatherEvent,
} from "@/lib/weather/history";
import {
  SOURCE_LABEL,
  SOURCE_META,
  SOURCE_TYPE_LABEL,
  type WeatherSourceKey,
} from "@/lib/weather/sources";

const PERIODS = [
  { key: "7", label: "7 dias" },
  { key: "30", label: "30 dias" },
  { key: "90", label: "90 dias" },
] as const;

const INTENSITY_COLOR: Record<string, string> = {
  garoa: "bg-sky-400/30 border-sky-400/60 text-sky-200",
  fraca: "bg-amber-400/25 border-amber-400/60 text-amber-200",
  moderada: "bg-orange-500/25 border-orange-500/60 text-orange-200",
  forte: "bg-red-500/25 border-red-500/60 text-red-200",
  tempestade: "bg-fuchsia-500/25 border-fuchsia-500/60 text-fuchsia-200",
};

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function HistoricoChuva() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("30");

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - Number(period) * 86400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [period]);

  const obsQuery = useQuery({
    queryKey: ["weather-observations", range.from],
    queryFn: () => listObservations(range.from, range.to),
    staleTime: 60_000,
  });
  const eventsQuery = useQuery({
    queryKey: ["weather-events", range.from],
    queryFn: () => listEvents(range.from, range.to),
    staleTime: 60_000,
  });
  const healthQuery = useQuery({
    queryKey: ["weather-source-health"],
    queryFn: listSourceHealth,
    staleTime: 60_000,
  });

  const obs = obsQuery.data ?? [];
  const events = eventsQuery.data ?? [];
  const days = useMemo(() => aggregateByDay(obs), [obs]);
  const hours = useMemo(() => aggregateByHour(obs).slice(-72), [obs]);

  const totalMm = days.reduce((a, d) => a + d.mm, 0);
  const rainyDays = days.filter((d) => d.rainy).length;
  const openEvent = events.find((e) => e.status === "aberto") ?? null;

  // Calendário mensal do mês corrente dentro do período
  const calendar = useMemo(() => {
    const ref = new Date();
    const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const total = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
    const pad = first.getDay();
    const byDate = new Map(days.map((d) => [d.date, d]));
    const cells: ({ date: string; day: number; agg: (typeof days)[number] | undefined } | null)[] =
      [];
    for (let i = 0; i < pad; i++) cells.push(null);
    for (let d = 1; d <= total; d++) {
      const date = new Date(ref.getFullYear(), ref.getMonth(), d).toLocaleDateString("sv-SE");
      cells.push({ date, day: d, agg: byDate.get(date) });
    }
    return { cells, label: ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) };
  }, [days]);

  function exportCsv() {
    const header = [
      "Data",
      "Volume acumulado (mm)",
      "Choveu",
      "Intensidade máxima",
      "Fontes",
      "Confiança",
    ];
    const rows = days.map((d) => [
      d.date,
      d.mm.toFixed(2),
      d.rainy ? "Sim" : "Não",
      d.maxIntensity ?? "—",
      d.sources.map(SOURCE_LABEL).join(" | "),
      `${Math.round(d.bestConfidence * 100)}%`,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    downloadBlob(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
      `historico-chuva-${period}d.csv`,
    );
  }

  async function exportPdf() {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("Histórico de chuva — Taludes", 14, 16);
    doc.setFontSize(9);
    doc.text(
      `Período: últimos ${period} dias · Volume total ${totalMm.toFixed(1)} mm · ${rainyDays} dia(s) com chuva`,
      14,
      22,
    );
    autoTable(doc, {
      startY: 28,
      head: [["Data", "mm", "Choveu", "Intensidade", "Fontes", "Confiança"]],
      body: days.map((d) => [
        d.date,
        d.mm.toFixed(2),
        d.rainy ? "Sim" : "Não",
        d.maxIntensity ?? "—",
        d.sources.map(SOURCE_LABEL).join(", "),
        `${Math.round(d.bestConfidence * 100)}%`,
      ]),
      styles: { fontSize: 8 },
    });
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    autoTable(doc, {
      startY: y,
      head: [["Evento", "Início", "Fim", "Situação", "Intensidade", "mm", "Confirmação"]],
      body: events.map((e, i) => [
        `#${i + 1}`,
        fmtDateTime(e.started_at),
        fmtDateTime(e.ended_at),
        e.status,
        e.max_intensity ?? "—",
        Number(e.accumulated_mm ?? 0).toFixed(1),
        e.confirmation_type,
      ]),
      styles: { fontSize: 8 },
    });
    doc.save(`historico-chuva-${period}d.pdf`);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Filtros + KPIs */}
      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CloudRain className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold sm:text-lg">Histórico visual de chuva</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PERIODS.map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant={period === p.key ? "default" : "outline"}
                className="min-h-11 rounded-full"
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 rounded-full"
              onClick={exportCsv}
            >
              <Download className="mr-1.5 h-4 w-4" /> Excel/CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 rounded-full"
              onClick={exportPdf}
            >
              <Download className="mr-1.5 h-4 w-4" /> PDF
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11 rounded-full"
              onClick={() => {
                obsQuery.refetch();
                eventsQuery.refetch();
                healthQuery.refetch();
              }}
            >
              <RefreshCw className={cn("h-4 w-4", obsQuery.isFetching && "animate-spin")} />
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-border/50 bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Volume acumulado</p>
            <p className="text-xl font-semibold">{totalMm.toFixed(1)} mm</p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Dias com chuva</p>
            <p className="text-xl font-semibold">{rainyDays}</p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Eventos no período</p>
            <p className="text-xl font-semibold">{events.length}</p>
          </div>
          <div className="rounded-2xl border border-border/50 bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Evento aberto</p>
            <p className="text-xl font-semibold">{openEvent ? "Sim" : "Não"}</p>
          </div>
        </div>
      </GlassCard>

      {/* Calendário mensal */}
      <GlassCard>
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold capitalize sm:text-base">{calendar.label}</h3>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground sm:text-xs">
          {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
            <div key={i} className="py-1 font-medium">
              {d}
            </div>
          ))}
          {calendar.cells.map((cell, i) =>
            cell ? (
              <div
                key={cell.date}
                title={
                  cell.agg
                    ? `${cell.date} · ${cell.agg.mm.toFixed(1)} mm · ${cell.agg.maxIntensity ?? "sem chuva"} · fontes: ${cell.agg.sources.map(SOURCE_LABEL).join(", ")}`
                    : `${cell.date} · sem leitura`
                }
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center rounded-xl border p-1",
                  cell.agg?.rainy
                    ? INTENSITY_COLOR[cell.agg.maxIntensity ?? "garoa"]
                    : "border-border/40 bg-muted/10 text-muted-foreground",
                )}
              >
                <span className="text-xs font-semibold">{cell.day}</span>
                {cell.agg?.rainy ? (
                  <span className="text-[9px] leading-none">{cell.agg.mm.toFixed(1)}mm</span>
                ) : null}
              </div>
            ) : (
              <div key={`pad-${i}`} />
            ),
          )}
        </div>
      </GlassCard>

      {/* Timeline por hora — previsto x observado */}
      <GlassCard>
        <h3 className="mb-3 text-sm font-semibold sm:text-base">
          Timeline por hora — previsão × observado
        </h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={hours}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 10 }} unit="mm" width={44} />
              <Tooltip
                contentStyle={{ borderRadius: 12, fontSize: 12 }}
                formatter={(v: number, n) => [`${Number(v).toFixed(2)} mm`, n]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="observado"
                name="Observado/medido"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
              <Line
                dataKey="previsto"
                name="Previsto (modelo)"
                stroke="#f59e0b"
                dot={false}
                strokeWidth={2}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Previsão de modelo não é medição física local. Medições locais só aparecem quando uma
          estação observacional ou pluviômetro está configurado.
        </p>
      </GlassCard>

      {/* Eventos */}
      <GlassCard>
        <h3 className="mb-3 text-sm font-semibold sm:text-base">Eventos de chuva</h3>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento registrado no período.</p>
        ) : (
          <div className="space-y-2">
            {events.map((e: WeatherEvent) => (
              <div
                key={e.id}
                className="rounded-2xl border border-border/50 bg-muted/15 p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={e.status === "aberto" ? "aberto" : e.status} />
                  {e.max_intensity ? (
                    <Badge
                      variant="outline"
                      className={cn("rounded-full", INTENSITY_COLOR[e.max_intensity])}
                    >
                      {e.max_intensity}
                    </Badge>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {fmtDateTime(e.started_at)} → {fmtDateTime(e.ended_at)}
                  </span>
                </div>
                <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                  <span>Acumulado: {Number(e.accumulated_mm ?? 0).toFixed(1)} mm</span>
                  <span>Confiança: {Math.round(Number(e.confidence ?? 0) * 100)}%</span>
                  <span>Confirmação: {e.confirmation_type}</span>
                  <span className="sm:col-span-3">
                    Fontes: {(e.sources ?? []).map(SOURCE_LABEL).join(", ") || "—"}
                  </span>
                  {e.affected_scope && Object.keys(e.affected_scope).length ? (
                    <span className="sm:col-span-3">
                      Impacto: {JSON.stringify(e.affected_scope).slice(0, 220)}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Saúde das fontes */}
      <GlassCard>
        <div className="mb-3 flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold sm:text-base">Saúde das fontes</h3>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(healthQuery.data ?? []).map((h) => (
            <div key={h.source} className="rounded-2xl border border-border/50 bg-muted/15 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{SOURCE_LABEL(h.source)}</span>
                <StatusBadge status={h.state === "ok" ? "concluido" : "erro"} />
              </div>
              <div className="mt-1 grid gap-0.5 text-[11px] text-muted-foreground">
                <span>
                  Tipo:{" "}
                  {SOURCE_TYPE_LABEL[SOURCE_META[h.source as WeatherSourceKey]?.type ?? "previsao"]}
                </span>
                <span>Última execução: {fmtDateTime(h.last_run_at)}</span>
                <span>Última resposta válida: {fmtDateTime(h.last_success_at)}</span>
                <span className="flex items-center gap-1">
                  <Gauge className="h-3 w-3" /> Latência: {h.latency_ms ?? "—"} ms · erros
                  consecutivos: {h.consecutive_errors}
                </span>
                {h.last_error ? <span className="text-destructive">{h.last_error}</span> : null}
              </div>
            </div>
          ))}
          {(healthQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aguardando a primeira execução do monitor automático.
            </p>
          ) : null}
        </div>
      </GlassCard>
    </div>
  );
}

/** Registro manual de chuva por colaborador em campo. */
export function RegistroManualChuva() {
  const [saving, setSaving] = useState<string | null>(null);
  const opcoes = ["garoa", "fraca", "moderada", "forte", "tempestade"] as const;

  async function registrar(intensidade: (typeof opcoes)[number]) {
    setSaving(intensidade);
    try {
      await registrarChuvaManual({ intensidade });
      toast.success("Chuva registrada — evento aberto/atualizado e PTs revisadas.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <GlassCard>
      <h3 className="text-sm font-semibold sm:text-base">Registrar chuva manualmente</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Use quando houver chuva no local e as fontes automáticas ainda não tiverem detectado.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {opcoes.map((o) => (
          <Button
            key={o}
            size="sm"
            variant="outline"
            disabled={saving !== null}
            className={cn("min-h-11 rounded-full capitalize", INTENSITY_COLOR[o])}
            onClick={() => registrar(o)}
          >
            {o}
          </Button>
        ))}
      </div>
    </GlassCard>
  );
}
