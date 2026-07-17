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
                <div className="text-xs opacity-90">{(q.error as Error)?.message ?? "Erro desconhecido"}</div>
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

        {/* Cards principais */}
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {/* Card 1 — Clima atual */}
          <GlassCard className="lg:col-span-2 xl:col-span-1">
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3 w-3" /> Agora
              </span>
              {current?.is_day === 1 ? (
                <Sun className="h-4 w-4 text-amber-500" />
              ) : (
                <Moon className="h-4 w-4 text-indigo-400" />
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-5xl leading-none">{currentInfo.emoji}</div>
              <div>
                <div className="font-display text-4xl font-bold">
                  {current ? `${Math.round(current.temperature_2m)}°` : "—"}
                </div>
                <div className="text-sm text-muted-foreground">{currentInfo.label}</div>
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Sensação {current ? `${Math.round(current.apparent_temperature)}°` : "—"}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <Metric icon={<Thermometer className="h-3.5 w-3.5" />} label="Sensação" value={current ? `${Math.round(current.apparent_temperature)}°` : "—"} />
              <Metric icon={<Droplets className="h-3.5 w-3.5" />} label="Umidade" value={current ? `${Math.round(current.relative_humidity_2m)}%` : "—"} />
              <Metric icon={<Wind className="h-3.5 w-3.5" />} label="Vento" value={current ? `${current.wind_speed_10m.toFixed(1)} km/h` : "—"} />
              <Metric icon={<Wind className="h-3.5 w-3.5" />} label="Rajadas" value={current ? `${current.wind_gusts_10m.toFixed(1)} km/h` : "—"} />
              <Metric icon={<Cloud className="h-3.5 w-3.5" />} label="Nuvens" value={current ? `${Math.round(current.cloud_cover)}%` : "—"} />
              <Metric icon={<CloudRain className="h-3.5 w-3.5" />} label="Chuva atual" value={current ? `${current.rain.toFixed(1)} mm` : "—"} />
            </div>
          </GlassCard>

          {/* Card 3 — Resumo do dia */}
          <GlassCard>
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              <span>Resumo do Dia</span>
              <span>{daySummaryInfo.emoji}</span>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Thermometer className="h-3.5 w-3.5" /> Temperatura
                </span>
                <span className="font-semibold">
                  {daySummary ? `${Math.round(daySummary.min)}° / ${Math.round(daySummary.max)}°` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <CloudRain className="h-3.5 w-3.5" /> Prob. máx. chuva
                </span>
                <span className="font-semibold">{daySummary ? `${daySummary.probMax}%` : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Droplets className="h-3.5 w-3.5" /> Precipitação prevista
                </span>
                <span className="font-semibold">{daySummary ? `${daySummary.rainSum.toFixed(1)} mm` : "—"}</span>
              </div>
              <div className="rounded-lg border border-border/40 bg-background/40 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Condição predominante: </span>
                <span className="font-medium">{daySummaryInfo.label}</span>
              </div>
            </div>
          </GlassCard>

          {/* Card 4 — Situação operacional */}
          <GlassCard
            className={cn(
              "lg:col-span-2 xl:col-span-2 border bg-gradient-to-br ring-1",
              statusStyle.border,
              statusStyle.bg,
              statusStyle.ring,
            )}
          >
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              <span>Situação Operacional</span>
              <span>{Math.round(probMaxHoje)}% prob. chuva</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-5xl leading-none">{status.emoji}</div>
              <div>
                <div className={cn("font-display text-2xl font-bold", statusStyle.text)}>{status.titulo}</div>
                <div className="text-sm text-muted-foreground">{status.descricao}</div>
              </div>
            </div>
            {alertExternal && (
              <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3">
                <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-300">
                  <HardHat className="h-3.5 w-3.5" /> Atividades externas potencialmente impactadas (≥ {EXTERNAL_ACTIVITY_ALERT_THRESHOLD}%)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {EXTERNAL_ACTIVITIES.map((a) => (
                    <Badge key={a} variant="outline" className="border-red-400/50 bg-red-500/10 text-red-700 dark:text-red-200">
                      {a}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </GlassCard>
        </div>

        {/* Card 2 — Probabilidade de chuva por hora */}
        <GlassCard>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold">Probabilidade de chuva por hora</h3>
              <p className="text-xs text-muted-foreground">Próximas 24 horas — probabilidade (%) e volume (mm)</p>
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
                <XAxis dataKey="hora" fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} />
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
                <Bar yAxisId="mm" dataKey="chuva" fill="hsl(210 90% 55% / 0.45)" radius={[4, 4, 0, 0]} />
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

        <div className="text-right text-[11px] text-muted-foreground">
          Última atualização:{" "}
          {data ? new Date(data.fetched_at).toLocaleString("pt-BR") : "—"} · Fonte: Open-Meteo
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
