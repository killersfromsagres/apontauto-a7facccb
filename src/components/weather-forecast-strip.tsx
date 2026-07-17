import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, CloudRain, Droplets, Wind, HardHat } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWeather } from "@/hooks/use-weather";
import {
  weatherCodeInfo,
  shouldAlertExternalActivities,
  EXTERNAL_ACTIVITY_ALERT_THRESHOLD,
} from "@/lib/weather/open-meteo";

const WEEK_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEK_LONG = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export interface WeatherForecastStripProps {
  /** Se true, filtra apenas dias úteis (seg-sex). Default: true */
  businessDaysOnly?: boolean;
  /** Título do bloco */
  title?: string;
  subtitle?: string;
  className?: string;
}

export function WeatherForecastStrip({
  businessDaysOnly = true,
  title = "Próximos dias úteis",
  subtitle = "Previsão para planejamento de atividades externas",
  className,
}: WeatherForecastStripProps) {
  const q = useWeather();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const days = useMemo(() => {
    if (!q.data) return [];
    const d = q.data.daily;
    return d.time
      .map((iso, i) => {
        const dt = new Date(iso + "T12:00:00");
        return {
          iso,
          date: dt,
          dow: dt.getDay(),
          code: d.weather_code[i],
          tmax: d.temperature_2m_max[i],
          tmin: d.temperature_2m_min[i],
          prob: d.precipitation_probability_max[i] ?? 0,
          rain: d.rain_sum[i] ?? 0,
          wind: d.wind_speed_10m_max[i] ?? 0,
        };
      })
      .filter((d) => (businessDaysOnly ? d.dow >= 1 && d.dow <= 5 : true));
  }, [q.data, businessDaysOnly]);

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      ro.disconnect();
    };
  }, [updateArrows, days.length]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: "smooth" });
  };

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-background/70 via-background/40 to-background/20 p-4 shadow-sm backdrop-blur",
        className,
      )}
    >
      <div className="mb-3 flex items-end justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-semibold tracking-tight">{title}</h3>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className="hidden gap-1 sm:flex">
          <ArrowBtn dir="left" disabled={!canLeft} onClick={() => scrollBy(-1)} />
          <ArrowBtn dir="right" disabled={!canRight} onClick={() => scrollBy(1)} />
        </div>
      </div>

      <div className="relative">
        {/* Fade masks */}
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-background/95 to-transparent transition-opacity",
            canLeft ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background/95 to-transparent transition-opacity",
            canRight ? "opacity-100" : "opacity-0",
          )}
        />

        {/* Mobile arrows overlay */}
        <button
          type="button"
          aria-label="Voltar"
          onClick={() => scrollBy(-1)}
          className={cn(
            "absolute left-1 top-1/2 z-20 -translate-y-1/2 rounded-full border border-border/60 bg-background/80 p-1 shadow-md backdrop-blur transition sm:hidden",
            !canLeft && "pointer-events-none opacity-0",
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Avançar"
          onClick={() => scrollBy(1)}
          className={cn(
            "absolute right-1 top-1/2 z-20 -translate-y-1/2 rounded-full border border-border/60 bg-background/80 p-1 shadow-md backdrop-blur transition sm:hidden",
            !canRight && "pointer-events-none opacity-0",
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div
          ref={scrollRef}
          className="scrollbar-none flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          {q.isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-40 w-40 shrink-0 animate-pulse rounded-xl border border-border/40 bg-muted/30"
              />
            ))}

          {!q.isLoading && days.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">
              Sem previsão disponível.
            </div>
          )}

          {days.map((d) => {
            const info = weatherCodeInfo(d.code);
            const isToday = d.iso === todayIso;
            const alert = shouldAlertExternalActivities(d.prob);
            return (
              <div
                key={d.iso}
                className={cn(
                  "group relative flex w-40 shrink-0 snap-start flex-col rounded-xl border p-3 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg",
                  "border-border/50 bg-background/60 backdrop-blur",
                  isToday && "border-primary/60 ring-1 ring-primary/40",
                  alert && "border-red-500/50 ring-1 ring-red-500/30",
                )}
              >
                {isToday && (
                  <span className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-primary-foreground shadow-md">
                    Hoje
                  </span>
                )}
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {WEEK_LABELS[d.dow]}
                    </div>
                    <div className="font-display text-sm font-bold leading-tight">
                      {String(d.date.getDate()).padStart(2, "0")}/
                      {String(d.date.getMonth() + 1).padStart(2, "0")}
                    </div>
                  </div>
                  <div className="text-3xl leading-none transition-transform duration-300 group-hover:scale-110">
                    {info.emoji}
                  </div>
                </div>

                <div className="mt-1 line-clamp-1 text-[10px] text-muted-foreground" title={info.label}>
                  {info.label}
                </div>

                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-lg font-bold text-foreground">
                    {Math.round(d.tmax)}°
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(d.tmin)}°
                  </span>
                </div>

                {/* Rain gauge */}
                <div className="mt-2">
                  <div className="mb-1 flex items-center justify-between text-[10px]">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <CloudRain className="h-3 w-3" />
                      Chuva
                    </span>
                    <span
                      className={cn(
                        "font-bold",
                        d.prob >= EXTERNAL_ACTIVITY_ALERT_THRESHOLD
                          ? "text-red-600 dark:text-red-400"
                          : d.prob >= 40
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {Math.round(d.prob)}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        d.prob >= EXTERNAL_ACTIVITY_ALERT_THRESHOLD
                          ? "bg-gradient-to-r from-red-500 to-red-600"
                          : d.prob >= 40
                            ? "bg-gradient-to-r from-amber-400 to-amber-500"
                            : "bg-gradient-to-r from-emerald-400 to-emerald-500",
                      )}
                      style={{ width: `${Math.max(4, Math.min(100, d.prob))}%` }}
                    />
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Droplets className="h-2.5 w-2.5" />
                    {d.rain.toFixed(1)}mm
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Wind className="h-2.5 w-2.5" />
                    {Math.round(d.wind)}km/h
                  </span>
                </div>

                {alert && (
                  <div className="mt-2 inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-red-700 dark:text-red-300">
                    <HardHat className="h-2.5 w-2.5" />
                    Externo em risco
                  </div>
                )}

                <div className="sr-only">
                  {WEEK_LONG[d.dow]} — {info.label} — máx {Math.round(d.tmax)}° / mín{" "}
                  {Math.round(d.tmin)}° — {Math.round(d.prob)}% de chuva
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ArrowBtn({
  dir,
  disabled,
  onClick,
}: {
  dir: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = dir === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={dir === "left" ? "Voltar" : "Avançar"}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/70 text-muted-foreground shadow-sm backdrop-blur transition-all",
        "hover:border-primary/60 hover:bg-primary/10 hover:text-primary hover:shadow-md",
        "disabled:pointer-events-none disabled:opacity-30",
      )}
    >
      <Icon className="h-4 w-4 transition-transform group-hover:scale-110" />
    </button>
  );
}

