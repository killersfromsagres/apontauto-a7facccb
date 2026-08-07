import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ComposedChart,
} from "recharts";
import {
  RefreshCw,
  Thermometer,
  CloudRain,
  Wind,
  Droplets,
  Sun,
  Moon,
  Cloud,
  AlertTriangle,
  MapPin,
  Clock,
  HardHat,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useWeather } from "@/hooks/use-weather";
import {
  WEATHER_LOCATION,
  weatherCodeInfo,
  situationStatus,
  EXTERNAL_ACTIVITIES,
  shouldAlertExternalActivities,
  EXTERNAL_ACTIVITY_ALERT_THRESHOLD,
} from "@/lib/weather/open-meteo";
import { WeatherForecastStrip } from "@/components/weather-forecast-strip";
import { HistoricoChuva, RegistroManualChuva } from "@/components/clima/historico-chuva";

export const Route = createFileRoute("/_authenticated/clima-tempo")({
  head: () => ({
    meta: [
      { title: "Clima e Tempo — Apont Auto" },
      {
        name: "description",
        content:
          "Monitoramento meteorológico em tempo real (Open-Meteo) para São Bernardo do Campo — Demarchi.",
      },
    ],
  }),
  component: ClimaTempoPage,
});

const STATUS_STYLES: Record<
  ReturnType<typeof situationStatus>["nivel"],
  { border: string; bg: string; text: string; ring: string }
> = {
  normal: {
    border: "border-emerald-500/50",
    bg: "from-emerald-500/15 to-emerald-500/5",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-400/30",
  },
  atencao: {
    border: "border-amber-500/50",
    bg: "from-amber-500/15 to-amber-500/5",
    text: "text-amber-700 dark:text-amber-300",
    ring: "ring-amber-400/30",
  },
  alto: {
    border: "border-orange-500/60",
    bg: "from-orange-500/20 to-orange-500/5",
    text: "text-orange-700 dark:text-orange-300",
    ring: "ring-orange-400/40",
  },
  reprogramar: {
    border: "border-red-500/70",
    bg: "from-red-500/25 to-red-500/5",
    text: "text-red-700 dark:text-red-300",
    ring: "ring-red-400/50",
  },
  suspenso: {
    border: "border-red-500/70",
    bg: "from-red-500/25 to-red-500/5",
    text: "text-red-700 dark:text-red-300",
    ring: "ring-red-400/50",
  },
};

function ClimaTempoPage() {
  const q = useWeather();
  const data = q.data;

  const current = data?.current;
  const currentInfo = weatherCodeInfo(current?.weather_code);

  // Próximas 24h para gráfico
  const hourlySeries = useMemo(() => {
    if (!data) return [];
    const now = Date.now();
    return data.hourly.time
      .map((t, i) => ({
        raw: new Date(t).getTime(),
        hora: new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        probabilidade: data.hourly.precipitation_probability[i] ?? 0,
        chuva: Number((data.hourly.rain[i] ?? 0).toFixed(2)),
        temperatura: data.hourly.temperature_2m[i] ?? null,
      }))
      .filter((h) => h.raw >= now - 60 * 60_000)
      .slice(0, 24);
  }, [data]);

  const probMaxHoje = data?.daily.precipitation_probability_max[0] ?? current?.rain ?? 0;
  const status = situationStatus(probMaxHoje);
  const statusStyle = STATUS_STYLES[status.nivel];
  const alertExternal = shouldAlertExternalActivities(probMaxHoje);

  const daySummary = data
    ? {
        max: data.daily.temperature_2m_max[0],
        min: data.daily.temperature_2m_min[0],
        probMax: data.daily.precipitation_probability_max[0] ?? 0,
        rainSum: data.daily.rain_sum[0] ?? 0,
        code: data.daily.weather_code[0],
      }
    : null;
  const daySummaryInfo = weatherCodeInfo(daySummary?.code);

  return (
    <PageShell
      title="Clima e Tempo"
      description={`Monitoramento meteorológico — ${WEATHER_LOCATION.cidade} · ${WEATHER_LOCATION.bairro} · ${WEATHER_LOCATION.estado}. Fonte: Open-Meteo (atualiza a cada 30 min).`}
      actions={
        <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={cn("mr-2 h-4 w-4", q.isFetching && "animate-spin")} />
          Atualizar agora
        </Button>
      }
    >
      <div className="space-y-5">
        {q.isError && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">Falha ao consultar o Open-Meteo</div>
                <div className="text-xs opacity-90">
                  {(q.error as Error)?.message ?? "Erro desconhecido"}
                </div>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
              <RefreshCw className={cn("mr-2 h-3.5 w-3.5", q.isFetching && "animate-spin")} />
              Tentar novamente
            </Button>
          </div>
        )}

        {q.isLoading && !data && (
          <div className="rounded-lg border border-border/40 bg-background/40 px-4 py-3 text-sm text-muted-foreground">
            Carregando dados meteorológicos…
          </div>
        )}

        {/* Seção Superior — Cards de Impacto */}
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Card 1 — Clima agora (Foco Visual) */}
          <GlassCard className="flex flex-col justify-between lg:col-span-12 xl:col-span-4 min-h-[220px]">
            <div>
              <div className="mb-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3 w-3 text-primary" /> Agora
                </span>
                <Badge variant="outline" className="h-5 px-2 text-[9px] font-bold uppercase bg-background/50 backdrop-blur-sm border-primary/20">
                  Real-time
                </Badge>
              </div>
              <div className="flex items-center gap-6">
                <div className="relative">
                  <div className="text-7xl leading-none drop-shadow-2xl animate-pulse-slow">
                    {currentInfo.emoji}
                  </div>
                  {current?.is_day === 1 ? (
                    <Sun className="absolute -right-2 -top-2 h-6 w-6 text-amber-500 animate-spin-slow" />
                  ) : (
                    <Moon className="absolute -right-2 -top-2 h-6 w-6 text-indigo-400" />
                  )}
                </div>
                <div>
                  <div className="font-display text-6xl font-black tracking-tighter">
                    {current ? `${Math.round(current.temperature_2m)}°` : "—"}
                  </div>
                  <div className="text-base font-medium text-foreground/80">{currentInfo.label}</div>
                </div>
              </div>
            </div>
            
            <div className="mt-6 grid grid-cols-3 gap-2">
              <div className="flex flex-col rounded-2xl bg-primary/5 p-2 border border-primary/10">
                <span className="text-[9px] font-bold uppercase text-muted-foreground/80">Vento</span>
                <span className="text-xs font-black">{current ? `${current.wind_speed_10m.toFixed(0)} km/h` : "—"}</span>
              </div>
              <div className="flex flex-col rounded-2xl bg-sky-500/5 p-2 border border-sky-500/10">
                <span className="text-[9px] font-bold uppercase text-muted-foreground/80">Umidade</span>
                <span className="text-xs font-black">{current ? `${Math.round(current.relative_humidity_2m)}%` : "—"}</span>
              </div>
              <div className="flex flex-col rounded-2xl bg-amber-500/5 p-2 border border-amber-500/10">
                <span className="text-[9px] font-bold uppercase text-muted-foreground/80">Sensação</span>
                <span className="text-xs font-black">{current ? `${Math.round(current.apparent_temperature)}°` : "—"}</span>
              </div>
            </div>
          </GlassCard>

          {/* Card 2 — Situação Operacional (Ação/Decisão) */}
          <GlassCard
            className={cn(
              "lg:col-span-7 xl:col-span-5 border-2 bg-gradient-to-br ring-1 relative overflow-hidden",
              statusStyle.border,
              statusStyle.bg,
              statusStyle.ring,
            )}
          >
            <div className="absolute -right-8 -top-8 text-8xl opacity-10 rotate-12">
              {status.emoji}
            </div>
            <div className="mb-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
              <span>Situação Operacional</span>
              <span className="bg-background/40 px-2 py-0.5 rounded-full backdrop-blur-md">{Math.round(probMaxHoje)}% prob. chuva</span>
            </div>
            <div className="flex items-start gap-4">
              <div className="text-5xl bg-background/50 p-3 rounded-2xl shadow-inner">{status.emoji}</div>
              <div className="space-y-1">
                <div className={cn("font-display text-3xl font-black tracking-tight", statusStyle.text)}>
                  {status.titulo}
                </div>
                <div className="text-sm font-medium text-foreground/70 leading-relaxed max-w-[280px]">
                  {status.descricao}
                </div>
              </div>
            </div>
            {alertExternal && (
              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 backdrop-blur-sm">
                <div className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-red-600 dark:text-red-400">
                  <HardHat className="h-3.5 w-3.5" /> Atividades Críticas (≥{EXTERNAL_ACTIVITY_ALERT_THRESHOLD}%)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {EXTERNAL_ACTIVITIES.slice(0, 5).map((a) => (
                    <Badge
                      key={a}
                      variant="outline"
                      className="h-5 text-[9px] border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300 font-bold"
                    >
                      {a}
                    </Badge>
                  ))}
                  {EXTERNAL_ACTIVITIES.length > 5 && <span className="text-[9px] font-bold text-red-500/70">+{EXTERNAL_ACTIVITIES.length - 5}</span>}
                </div>
              </div>
            )}
          </GlassCard>

          {/* Card 3 — Resumo Rápido (Dia) */}
          <GlassCard className="lg:col-span-5 xl:col-span-3 flex flex-col justify-between">
            <div className="mb-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
              <span>Resumo do Dia</span>
              <span className="text-lg">{daySummaryInfo.emoji}</span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2 rounded-xl bg-muted/30">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase">
                  <Thermometer className="h-3 w-3" /> Temp.
                </span>
                <span className="text-sm font-black">
                  {daySummary ? `${Math.round(daySummary.min)}°` : "—"} 
                  <span className="mx-1 opacity-30">/</span>
                  {daySummary ? `${Math.round(daySummary.max)}°` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-muted/30">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase">
                  <CloudRain className="h-3 w-3" /> Prob.
                </span>
                <span className="text-sm font-black">{daySummary ? `${daySummary.probMax}%` : "—"}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-muted/30">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase">
                  <Droplets className="h-3 w-3" /> Vol.
                </span>
                <span className="text-sm font-black">{daySummary ? `${daySummary.rainSum.toFixed(1)} mm` : "—"}</span>
              </div>
            </div>
            <div className="mt-4 text-[10px] font-bold text-center py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {daySummaryInfo.label}
            </div>
          </GlassCard>
        </div>

        {/* Card 2 — Probabilidade de chuva por hora */}
        <GlassCard>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold">
                Probabilidade de chuva por hora
              </h3>
              <p className="text-xs text-muted-foreground">
                Próximas 24 horas — probabilidade (%) e volume (mm)
              </p>
            </div>
            <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {data ? new Date(data.fetched_at).toLocaleTimeString("pt-BR") : "—"}
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={hourlySeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
                <XAxis
                  dataKey="hora"
                  fontSize={11}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  yAxisId="prob"
                  orientation="left"
                  domain={[0, 100]}
                  fontSize={11}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  unit="%"
                />
                <YAxis
                  yAxisId="mm"
                  orientation="right"
                  fontSize={11}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  unit=" mm"
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: unknown, name: string) => {
                    if (name === "probabilidade") return [`${value}%`, "Probabilidade"];
                    if (name === "chuva") return [`${value} mm`, "Volume"];
                    return [String(value), name];
                  }}
                />
                <Bar
                  yAxisId="mm"
                  dataKey="chuva"
                  fill="hsl(210 90% 55% / 0.45)"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="prob"
                  type="monotone"
                  dataKey="probabilidade"
                  stroke="hsl(220 90% 60%)"
                  strokeWidth={2.5}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        {/* Próximos dias úteis — rolagem horizontal */}
        <WeatherForecastStrip />

        <RegistroManualChuva />

        <HistoricoChuva />

        <div className="text-right text-[11px] text-muted-foreground">
          Última atualização: {data ? new Date(data.fetched_at).toLocaleString("pt-BR") : "—"} ·
          Fonte: Open-Meteo
        </div>
      </div>
    </PageShell>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/40 bg-background/40 px-2.5 py-1.5">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
