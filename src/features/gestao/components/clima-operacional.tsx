import { useMemo } from "react";
import { CloudRain, Droplets, Thermometer, Wind } from "lucide-react";
import { useWeather } from "@/hooks/use-weather";
import {
  detectRain,
  effectiveTaludeStatus,
  weatherCodeInfo,
  WEATHER_LOCATION,
} from "@/lib/weather/open-meteo";
import { WeatherForecastStrip } from "@/components/weather-forecast-strip";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  normal: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  atencao: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  alto: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  reprogramar: "border-destructive/30 bg-destructive/10 text-destructive",
  suspenso: "border-destructive/30 bg-destructive/10 text-destructive",
};

function Metrica({
  icon: Icon,
  label,
  valor,
}: {
  icon: typeof Wind;
  label: string;
  valor: string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/40 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums">{valor}</p>
    </div>
  );
}

/**
 * Painel de clima operacional do Centro de Gestão.
 *
 * Somente leitura: consome a mesma fonte (Open-Meteo) já usada pelo módulo de
 * taludes. Nenhuma regra de suspensão é decidida aqui — o gestor apenas vê a
 * condição atual e a previsão que sustentam as suspensões automáticas.
 */
export function ClimaOperacional({ ptSuspensas }: { ptSuspensas?: number }) {
  const q = useWeather();

  const resumo = useMemo(() => {
    if (!q.data) return null;
    const chuva = detectRain(q.data);
    const probHoje = q.data.daily.precipitation_probability_max[0] ?? 0;
    const status = effectiveTaludeStatus(probHoje, chuva);
    const info = weatherCodeInfo(q.data.current.weather_code);
    return { chuva, probHoje, status, info };
  }, [q.data]);

  if (q.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (q.isError || !resumo || !q.data) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Não foi possível carregar o clima agora. Os indicadores de taludes acima seguem válidos e a
        suspensão automática por chuva continua ativa no módulo de taludes.
      </p>
    );
  }

  const c = q.data.current;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4",
          TONE[resumo.status.nivel] ?? TONE.normal,
        )}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {resumo.status.emoji} {resumo.status.titulo}
          </p>
          <p className="mt-0.5 text-xs opacity-90">{resumo.status.descricao}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {WEATHER_LOCATION.label} · {resumo.info.label} · atualizado às{" "}
            {new Date(q.data.fetched_at).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {resumo.chuva.detected ? (
            <Badge variant="destructive">
              {resumo.chuva.emoji} {resumo.chuva.label}
            </Badge>
          ) : (
            <Badge variant="secondary">Sem chuva no momento</Badge>
          )}
          {ptSuspensas ? (
            <Badge variant="outline">{ptSuspensas} PT suspensa(s)</Badge>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica icon={Thermometer} label="Temperatura" valor={`${Math.round(c.temperature_2m)}°C`} />
        <Metrica
          icon={CloudRain}
          label="Chuva hoje"
          valor={`${resumo.probHoje}% · ${resumo.chuva.mm_dia.toFixed(1)} mm`}
        />
        <Metrica icon={Wind} label="Vento" valor={`${Math.round(c.wind_speed_10m)} km/h`} />
        <Metrica
          icon={Droplets}
          label="Umidade"
          valor={`${Math.round(c.relative_humidity_2m)}%`}
        />
      </div>

      <WeatherForecastStrip
        title="Janela operacional da semana"
        subtitle="Use a previsão para reprogramar taludes, pintura e demais serviços externos"
      />
    </div>
  );
}
