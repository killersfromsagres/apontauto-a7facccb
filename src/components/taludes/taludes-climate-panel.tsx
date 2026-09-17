import {
  AlertTriangle,
  CloudRain,
  Droplets,
  Gauge,
  RefreshCw,
  Thermometer,
  Wind,
} from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { WeatherForecastStrip } from "@/components/weather-forecast-strip";
import { HistoricoChuva, RegistroManualChuva } from "@/components/clima/historico-chuva";
import { Button } from "@/components/ui/button";
import { useWeather } from "@/hooks/use-weather";
import {
  detectRain,
  effectiveTaludeStatus,
  weatherCodeInfo,
  WEATHER_LOCATION,
} from "@/lib/weather/open-meteo";
import { cn } from "@/lib/utils";

function sourceLabel(source?: string) {
  if (source === "met.no") return "MET Norway · modelo de previsão";
  if (source === "open-meteo") return "Open-Meteo · modelo de previsão";
  return "Modelo meteorológico";
}

function fmtUpdate(iso?: string) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function Metric({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        accent
          ? "border-red-400/25 bg-red-500/[0.07]"
          : "border-white/[0.07] bg-white/[0.025]",
      )}
    >
      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/40">
        {icon}
        {label}
      </div>
      <p className={cn("mt-1.5 text-sm font-black tabular-nums", accent ? "text-red-200" : "text-white/90")}>
        {value}
      </p>
    </div>
  );
}

export function TaludesClimatePanel() {
  const weather = useWeather();

  if (weather.isLoading) {
    return (
      <div className="space-y-4">
        <GlassCard className="min-h-44 animate-pulse border-white/[0.06] bg-white/[0.025]" />
        <GlassCard className="min-h-56 animate-pulse border-white/[0.06] bg-white/[0.025]" />
      </div>
    );
  }

  if (weather.isError || !weather.data) {
    return (
      <GlassCard className="border-red-500/20 bg-red-500/[0.04] p-8 text-center">
        <AlertTriangle className="mx-auto h-9 w-9 text-red-300" />
        <h3 className="mt-3 font-semibold">Clima temporariamente indisponível</h3>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Não foi possível consultar as fontes meteorológicas. O histórico e as medições registradas continuam preservados.
        </p>
        <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => weather.refetch()}>
          <RefreshCw className="h-4 w-4" /> Atualizar novamente
        </Button>
      </GlassCard>
    );
  }

  const data = weather.data;
  const current = data.current;
  const rain = detectRain(data);
  const probability = data.daily.precipitation_probability_max?.[0] ?? 0;
  const status = effectiveTaludeStatus(probability, rain);
  const condition = weatherCodeInfo(current.weather_code);

  return (
    <div className="space-y-5 pb-8">
      <GlassCard
        className={cn(
          "overflow-hidden border p-0",
          rain.detected ? "border-red-400/25" : "border-emerald-400/15",
        )}
      >
        <div className="border-b border-white/[0.06] bg-black/10 p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.13em]",
                    status.nivel === "suspenso"
                      ? "border-red-400/30 bg-red-500/15 text-red-200"
                      : status.nivel === "normal"
                        ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                        : "border-amber-400/25 bg-amber-500/10 text-amber-200",
                  )}
                >
                  {status.titulo}
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/35">
                  {WEATHER_LOCATION.bairro} · {WEATHER_LOCATION.cidade}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-4xl" aria-hidden="true">{condition.emoji}</span>
                <div>
                  <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">
                    {condition.label}
                  </h2>
                  <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                    {status.descricao}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5">
              <div className="text-right">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/35">{sourceLabel(data.source)}</p>
                <p className="mt-0.5 text-[10px] text-white/55">Atualizado {fmtUpdate(data.fetched_at)}</p>
              </div>
              <Button variant="ghost" size="icon-sm" title="Atualizar clima" onClick={() => weather.refetch()}>
                <RefreshCw className={cn("h-4 w-4", weather.isFetching && "animate-spin")} />
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 xl:grid-cols-8 sm:p-5">
          <Metric label="Temperatura" value={`${Math.round(current.temperature_2m)} °C`} icon={<Thermometer className="h-3 w-3" />} />
          <Metric label="Sensação" value={`${Math.round(current.apparent_temperature)} °C`} icon={<Thermometer className="h-3 w-3" />} />
          <Metric label="Umidade" value={`${Math.round(current.relative_humidity_2m)}%`} icon={<Droplets className="h-3 w-3" />} />
          <Metric label="Vento" value={`${Math.round(current.wind_speed_10m)} km/h`} icon={<Wind className="h-3 w-3" />} />
          <Metric label="Rajada" value={`${Math.round(current.wind_gusts_10m)} km/h`} icon={<Wind className="h-3 w-3" />} />
          <Metric label="Chuva agora" value={`${rain.mm_atual.toFixed(1)} mm`} icon={<CloudRain className="h-3 w-3" />} accent={rain.detected} />
          <Metric label="Acum. dia" value={`${rain.mm_dia.toFixed(1)} mm`} icon={<Gauge className="h-3 w-3" />} />
          <Metric label="Prob. hoje" value={`${Math.round(probability)}%`} icon={<CloudRain className="h-3 w-3" />} />
        </div>

        <div className="mx-4 mb-4 flex flex-col justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[10px] sm:mx-5 sm:mb-5 sm:flex-row sm:items-center">
          <span className="text-white/60">
            Acumulado recente (até 3h disponíveis): <strong className="text-white">{rain.mm_acumulado_3h.toFixed(1)} mm</strong>
          </span>
          <span className="text-white/35">
            Previsão de modelo ≠ medição física local. Observações locais aparecem no histórico abaixo.
          </span>
        </div>
      </GlassCard>

      <WeatherForecastStrip
        businessDaysOnly={false}
        title="Previsão dos próximos 7 dias"
        subtitle="Planejamento meteorológico para inspeções e atividades em taludes"
      />

      <RegistroManualChuva />
      <HistoricoChuva />
    </div>
  );
}
