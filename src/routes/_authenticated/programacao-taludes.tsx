import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Cloud,
  CloudRain,
  Wind,
  Droplets,
  Thermometer,
  RefreshCw,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  ClipboardCheck,
  
  ExternalLink,
  History,
  Lock,
  MapPin,
  Sun,
  Gauge,
  CalendarClock,
} from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useWeather } from "@/hooks/use-weather";
import {
  WEATHER_LOCATION,
  weatherCodeInfo,
  effectiveTaludeStatus,

  detectRain,
  hasAnyRainRisk,
  riskLevelForProbability,
  type RainIntensity,
} from "@/lib/weather/open-meteo";
import {
  listarEvidencias,
  registrarEvidencia,
  removerEvidencia,
  type ChuvaEvidencia,
} from "@/lib/taludes-programacao/evidencias";
import { WeatherForecastStrip } from "@/components/weather-forecast-strip";
import { uploadImageToImgBB } from "@/lib/imgbb";

export const Route = createFileRoute("/_authenticated/programacao-taludes")({
  head: () => ({
    meta: [
      { title: "Programação de Taludes — Clima integrado" },
      {
        name: "description",
        content:
          "Programação de taludes integrada ao monitoramento climático em tempo real (Open-Meteo).",
      },
    ],
  }),
  component: ProgramacaoTaludesPage,
});

function fmtBR(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ProgramacaoTaludesPage() {
  const qc = useQueryClient();
  const weatherQ = useWeather();
  const data = weatherQ.data;

  const current = data?.current;
  const info = weatherCodeInfo(current?.weather_code);
  // Precisão: prob. da hora atual (hourly) tem prioridade sobre o máximo diário.
  const probHoraAtual = (() => {
    if (!data?.hourly?.time?.length) return null;
    const now = new Date();
    const hourStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:00`;
    const idx = data.hourly.time.findIndex((t) => t.startsWith(hourStr));
    return idx >= 0 ? Number(data.hourly.precipitation_probability?.[idx] ?? 0) : null;
  })();
  const probMaxDia = data?.daily.precipitation_probability_max[0] ?? 0;
  const probHoje = Math.max(probHoraAtual ?? 0, probMaxDia);
  const rainSumHoje = data?.daily.rain_sum[0] ?? 0;

  // Detecção precisa de chuva em curso (qualquer intensidade).
  const rain = useMemo(() => detectRain(data), [data]);
  // Status efetivo: se está chovendo (mesmo garoa), operação = SUSPENSA.
  const status = effectiveTaludeStatus(probHoje, rain);
  const alertExternal = shouldAlertExternalActivities(probHoje) || rain.detected;

  const panelRef = useRef<HTMLDivElement>(null);

  // Evidências de chuva
  const evidenciasQ = useQuery({
    queryKey: ["taludes-chuva-evidencias"],
    queryFn: () => listarEvidencias(50),
    staleTime: 60_000,
  });
  const [registrandoEvid, setRegistrandoEvid] = useState(false);

  const capturarERegistrar = async (opts: {
    intensity: RainIntensity | null;
    label: string;
    mensagem: string;
    silent?: boolean;
  }) => {
    if (!data || !panelRef.current) return null;
    const { toBlob } = await import("html-to-image");
    const blob = await toBlob(panelRef.current, {
      pixelRatio: 2,
      backgroundColor: "#0b1220",
    });
    if (!blob) throw new Error("Falha ao capturar screenshot");

    const hoje = todayISO();
    const filename = `evidencia-taludes-${opts.intensity ?? "manual"}-${hoje}-${Date.now()}.png`;

    // 1) Hospeda a imagem no ImgBB (não sobrecarrega Supabase Storage).
    let hostedUrl: string;
    try {
      const upload = await uploadImageToImgBB(blob, filename);
      hostedUrl = upload.display_url || upload.url;
    } catch (e) {
      throw new Error(`Falha ao hospedar imagem no ImgBB: ${(e as Error).message}`);
    }

    const mensagemFinal = opts.intensity
      ? `[${opts.label}] ${opts.mensagem}`
      : opts.mensagem;

    // 2) Persiste APENAS a URL pública no banco.
    const ev = await registrarEvidencia({
      data: hoje,
      mensagem: mensagemFinal,
      imagem_data_url: hostedUrl,
      temperatura: current?.temperature_2m ?? null,
      condicao: opts.label,
      precipitacao_mm: rain.mm_dia || rainSumHoje,
      prob_chuva: probHoje,
    });

    if (!opts.silent) {
      window.open(hostedUrl, "_blank", "noopener,noreferrer");
    }
    qc.invalidateQueries({ queryKey: ["taludes-chuva-evidencias"] });
    return ev;
  };

  const handleRegistrarEvidencia = async () => {
    setRegistrandoEvid(true);
    try {
      await capturarERegistrar({
        intensity: rain.intensity,
        label: rain.detected ? rain.label : info.label,
        mensagem:
          "Atividades de talude interrompidas devido a chuva — condição climática desfavorável registrada como evidência.",
      });
      toast.success("Evidência registrada e hospedada no ImgBB");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRegistrandoEvid(false);
    }
  };

  // Auto-registro: qualquer chuva detectada gera evidência automática,
  // com dedup por (data + intensidade) para não duplicar durante o dia.
  const autoRunRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!data || !rain.detected || !rain.intensity) return;
    if (evidenciasQ.isLoading) return;
    const chave = `${todayISO()}__${rain.intensity}`;
    if (autoRunRef.current.has(chave)) return;
    const jaRegistrada = (evidenciasQ.data ?? []).some(
      (ev) =>
        ev.data === todayISO() &&
        (ev.mensagem?.toLowerCase().includes(`[${rain.label.toLowerCase()}]`) ||
          (ev.condicao ?? "").toLowerCase() === rain.label.toLowerCase()),
    );
    if (jaRegistrada) {
      autoRunRef.current.add(chave);
      return;
    }
    autoRunRef.current.add(chave);
    // Aguarda 1s para garantir que o painel esteja renderizado antes do html-to-image.
    const t = window.setTimeout(() => {
      void capturarERegistrar({
        intensity: rain.intensity!,
        label: rain.label,
        mensagem: `Chuva detectada automaticamente (${rain.mm_atual.toFixed(1)} mm/h · acumulado ${rain.mm_dia.toFixed(1)} mm). Operação de talude suspensa por segurança.`,
        silent: true,
      }).then((ev) => {
        if (ev) toast.info(`Evidência automática registrada — ${rain.label}`);
      }).catch((e) => console.warn("[taludes] auto-evidencia", e));
    }, 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, rain.detected, rain.intensity, evidenciasQ.isLoading, evidenciasQ.data]);

  const rainAlertActive = rain.detected || status.nivel === "reprogramar";
  const anyRainRisk = hasAnyRainRisk(probHoje);
  const dayRisk = riskLevelForProbability(probHoje);
  const rainBadgeTone: Record<RainIntensity, string> = {
    garoa: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40",
    fraca: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40",
    moderada: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
    forte: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40",
    tempestade: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/50",
  };

  return (
    <PageShell
      title="Programação de Taludes"
      description={`Programação integrada ao clima em tempo real — ${WEATHER_LOCATION.cidade} · ${WEATHER_LOCATION.bairro} · ${WEATHER_LOCATION.estado}.`}
      actions={
        <>
          <Button variant="outline" size="sm" asChild>
            <Link to="/clima-tempo">
              <ExternalLink className="mr-2 h-4 w-4" />
              Dashboard Clima e Tempo
            </Link>
          </Button>
          <Button variant="outline" onClick={() => weatherQ.refetch()} disabled={weatherQ.isFetching}>
            <RefreshCw className={cn("mr-2 h-4 w-4", weatherQ.isFetching && "animate-spin")} />
            Atualizar clima
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {weatherQ.isError && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-800 dark:text-red-200">
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            Falha ao consultar Open-Meteo. Tente novamente em instantes.
          </div>
        )}

        {rainAlertActive && (
          <div
            className={cn(
              "relative overflow-hidden rounded-2xl border-2 px-5 py-4 shadow-xl",
              rain.intensity === "garoa"
                ? "border-amber-400/60 bg-gradient-to-r from-amber-500/20 via-orange-500/10 to-transparent animate-drizzle-glow"
                : "border-red-500/60 bg-gradient-to-r from-red-500/20 via-red-600/10 to-transparent animate-alert-glow",
            )}
          >
            <div
              className={cn(
                "pointer-events-none absolute inset-0 opacity-40 rain-shimmer",
                rain.intensity === "garoa"
                  ? "bg-gradient-to-r from-transparent via-amber-400/20 to-transparent"
                  : "bg-gradient-to-r from-transparent via-red-500/20 to-transparent",
              )}
            />
            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-lg",
                    rain.intensity === "garoa"
                      ? "bg-gradient-to-br from-amber-400 to-orange-500"
                      : "bg-gradient-to-br from-red-500 to-red-600",
                  )}
                >
                  <CloudRain className="h-6 w-6 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <p
                    className={cn(
                      "font-display text-base font-bold sm:text-lg",
                      rain.intensity === "garoa"
                        ? "text-amber-800 dark:text-amber-200"
                        : "text-red-700 dark:text-red-300",
                    )}
                  >
                    {rain.detected
                      ? `${rain.emoji} ${rain.label} em curso — atividades de talude INTERROMPIDAS`
                      : `${status.titulo} — atividades de talude devem ser reprogramadas`}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-xs sm:text-sm",
                      rain.intensity === "garoa"
                        ? "text-amber-900/90 dark:text-amber-100/90"
                        : "text-red-800/90 dark:text-red-200/90",
                    )}
                  >
                    {rain.detected ? (
                      <>
                        Precipitação atual: <b>{rain.mm_atual.toFixed(2)} mm/h</b> · acumulado hoje:{" "}
                        <b>{rain.mm_dia.toFixed(1)} mm</b> · prob. do dia: <b>{Math.round(probHoje)}%</b>.
                        Evidência automática registrada.
                      </>
                    ) : (
                      <>
                        Probabilidade de chuva hoje: {Math.round(probHoje)}%. Registre a evidência para o
                        histórico.
                      </>
                    )}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {rain.detected && rain.intensity && (
                      <Badge className={cn("border", rainBadgeTone[rain.intensity])}>
                        Intensidade: {rain.label}
                      </Badge>
                    )}
                    <Badge variant="outline" className="border-border/60 gap-1">
                      <CalendarClock className="h-3 w-3" />
                      {new Date().toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Badge>
                    <Badge variant="outline" className="border-border/60 gap-1">
                      <MapPin className="h-3 w-3" />
                      {WEATHER_LOCATION.bairro} · {WEATHER_LOCATION.cidade}
                    </Badge>
                  </div>
                </div>
              </div>
              <Button
                variant={rain.intensity === "garoa" ? "default" : "destructive"}
                size="sm"
                onClick={handleRegistrarEvidencia}
                disabled={registrandoEvid || !data}
                className="shrink-0"
              >
                {registrandoEvid ? "Enviando ao ImgBB…" : "Registrar evidência agora"}
              </Button>
            </div>
          </div>
        )}

        <PTCard />


        {/* Painel climático — Open-Meteo */}
        <div ref={panelRef}>
          <GlassCard
            className={cn(
              "space-y-4 border-2 transition-all duration-500",
              // Verde — Operação liberada
              status.nivel === "normal" &&
                "border-emerald-500/50 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent shadow-[0_0_40px_-8px_rgba(16,185,129,0.35)]",
              // Amarelo — Atenção
              status.nivel === "atencao" &&
                "border-amber-400/60 bg-gradient-to-br from-amber-400/15 via-amber-400/5 to-transparent shadow-[0_0_40px_-8px_rgba(251,191,36,0.4)]",
              // Laranja — Alto risco
              status.nivel === "alto" &&
                "border-orange-500/60 bg-gradient-to-br from-orange-500/15 via-orange-500/5 to-transparent shadow-[0_0_40px_-8px_rgba(249,115,22,0.4)]",
              // Vermelho — Reprogramar (previsão alta, sem chuva ativa)
              status.nivel === "reprogramar" &&
                "border-red-500/60 bg-gradient-to-br from-red-500/15 via-red-500/5 to-transparent shadow-[0_0_40px_-8px_rgba(239,68,68,0.4)]",
              // Suspenso garoa — Amarelo pulsante intenso
              status.nivel === "suspenso" && rain.intensity === "garoa" &&
                "border-amber-400 bg-gradient-to-br from-amber-400/25 via-amber-300/10 to-transparent shadow-[0_0_50px_-4px_rgba(251,191,36,0.55)] animate-drizzle-glow",
              // Suspenso chuva — Vermelho pulsante intenso
              status.nivel === "suspenso" && rain.intensity && rain.intensity !== "garoa" &&
                "border-red-500 bg-gradient-to-br from-red-500/25 via-red-400/10 to-transparent shadow-[0_0_50px_-4px_rgba(239,68,68,0.6)] animate-alert-glow",
            )}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "relative text-5xl leading-none",
                    rain.detected && "drop-shadow-[0_0_12px_rgba(96,165,250,0.6)]",
                  )}
                >
                  {info.emoji}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    Clima agora — {WEATHER_LOCATION.cidade} · {WEATHER_LOCATION.bairro}
                  </div>
                  <div className="font-display text-2xl font-bold">
                    {current ? `${Math.round(current.temperature_2m)}°C` : "—"}
                    <span className="ml-3 text-base font-normal text-muted-foreground">
                      {current ? info.label : "Carregando…"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Sensação {current ? `${Math.round(current.apparent_temperature)}°C` : "—"} ·
                    Prob. chuva agora: <b className={cn(
                      dayRisk === "danger" ? "text-red-500" : dayRisk === "warning" ? "text-orange-500" : dayRisk === "watch" ? "text-amber-500" : "text-emerald-500"
                    )}>{Math.round(probHoraAtual ?? probHoje)}%</b>
                    {" · "}Pico dia: <b>{Math.round(probMaxDia)}%</b> · Acumulado {rainSumHoje.toFixed(1)} mm
                  </div>
                </div>
              </div>
              <Badge
                className={cn(
                  "px-4 py-2 text-sm font-bold shadow-md border-0 whitespace-nowrap",
                  status.nivel === "normal" &&
                    "bg-emerald-500 text-white hover:bg-emerald-500",
                  status.nivel === "atencao" &&
                    "bg-amber-400 text-amber-950 hover:bg-amber-400",
                  status.nivel === "alto" &&
                    "bg-orange-500 text-white hover:bg-orange-500",
                  status.nivel === "reprogramar" &&
                    "bg-red-500 text-white hover:bg-red-500",
                  status.nivel === "suspenso" && rain.intensity === "garoa" &&
                    "bg-amber-400 text-amber-950 hover:bg-amber-400 animate-pulse",
                  status.nivel === "suspenso" && rain.intensity !== "garoa" &&
                    "bg-red-500 text-white hover:bg-red-500 animate-pulse",
                )}
              >
                {status.nivel === "normal" ? (
                  <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
                ) : (
                  <AlertTriangle className="mr-1.5 inline h-4 w-4" />
                )}
                {status.titulo}
              </Badge>
            </div>

            {/* Barra de probabilidade destacada */}
            <div className="rounded-xl border border-border/40 bg-background/30 p-3">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground">
                  <CloudRain className="h-3.5 w-3.5" />
                  Probabilidade de chuva hoje
                </span>
                <span className={cn(
                  "tabular-nums font-bold text-sm",
                  dayRisk === "danger" ? "text-red-500" : dayRisk === "warning" ? "text-orange-500" : dayRisk === "watch" ? "text-amber-500" : "text-emerald-500"
                )}>
                  {Math.round(probHoje)}%
                </span>
              </div>
              <div className="relative h-3 overflow-hidden rounded-full bg-muted/70 ring-1 ring-border/40">
                <div
                  className={cn(
                    "h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ease-out",
                    dayRisk === "danger" ? "from-red-500 via-red-500 to-red-600 rain-shimmer" :
                    dayRisk === "warning" ? "from-amber-400 via-orange-400 to-orange-500 rain-shimmer" :
                    dayRisk === "watch" ? "from-yellow-300 via-yellow-400 to-amber-400" :
                    "from-emerald-400 via-emerald-500 to-emerald-500"
                  )}
                  style={{ width: `${probHoje === 0 ? 3 : Math.max(6, Math.min(100, Math.round(probHoje)))}%` }}
                />
              </div>
              {anyRainRisk && !rain.detected && (
                <div className={cn(
                  "mt-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium",
                  dayRisk === "danger" ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300" :
                  dayRisk === "warning" ? "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300" :
                  "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-300"
                )}>
                  <AlertTriangle className="h-3 w-3" />
                  Risco de chuva hoje — monitore antes de programar atividades de talude
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniMetric
                icon={<Thermometer className="h-4 w-4" />}
                label="Temperatura"
                value={current ? `${Math.round(current.temperature_2m)}°C` : "—"}
              />
              <MiniMetric
                icon={<Cloud className="h-4 w-4" />}
                label="Nuvens"
                value={current ? `${Math.round(current.cloud_cover)}%` : "—"}
              />
              <MiniMetric
                icon={<Wind className="h-4 w-4" />}
                label="Vento"
                value={current ? `${current.wind_speed_10m.toFixed(1)} km/h` : "—"}
              />
              <MiniMetric
                icon={<Droplets className="h-4 w-4" />}
                label="Umidade"
                value={current ? `${Math.round(current.relative_humidity_2m)}%` : "—"}
              />
              <MiniMetric
                icon={<Gauge className="h-4 w-4" />}
                label="Rajadas"
                value={current ? `${Math.round(current.wind_gusts_10m)} km/h` : "—"}
              />
              <MiniMetric
                icon={<Sun className="h-4 w-4" />}
                label="Período"
                value={current ? (current.is_day ? "Dia" : "Noite") : "—"}
              />
              <MiniMetric
                icon={<CloudRain className="h-4 w-4" />}
                label="Chuva agora"
                value={current ? `${(current.rain ?? 0).toFixed(2)} mm/h` : "—"}
              />
              <MiniMetric
                icon={<Droplets className="h-4 w-4" />}
                label="Sensação"
                value={current ? `${Math.round(current.apparent_temperature)}°C` : "—"}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" />
                Atualizado: {data ? new Date(data.fetched_at).toLocaleString("pt-BR") : "—"}
              </span>
              <span>Fonte: MET Norway + Open-Meteo · refresh a cada 5 min</span>
            </div>
          </GlassCard>
        </div>



        {/* Próximos dias úteis */}
        <WeatherForecastStrip
          title="Previsão para os próximos dias úteis"
          subtitle="Planejamento das atividades de talude — role para ver mais dias"
        />





        {/* Evidências */}
        <EvidenciasChuvaCard
          evidencias={evidenciasQ.data ?? []}
          onRemove={async (id) => {
            try {
              await removerEvidencia(id);
              toast.success("Evidência removida");
              qc.invalidateQueries({ queryKey: ["taludes-chuva-evidencias"] });
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      </div>
    </PageShell>
  );
}

function MiniMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/40 bg-background/40 px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

/* ============================================================
 * PT (Permissão de Trabalho) — persistida em app_settings
 * ============================================================ */
const PT_SETTING_ID = "pt_taludes_liberada";

type PTHistoricoItem = {
  liberada_em: string;          // ISO — data/hora em que a PT foi liberada pelo Corpo de Bombeiros
  registrado_em: string;        // ISO — quando o registro foi feito no sistema (auditoria)
  registrado_por: string | null;
  observacao?: string | null;
};

type PTData = {
  liberada_em: string | null;              // última liberação (espelha o último item do histórico)
  observacao?: string | null;
  atualizado_em?: string;
  atualizado_por?: string | null;
  historico?: PTHistoricoItem[];
};

function fmtDataHora(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Retorna a data/hora atual no formato aceito por <input type="datetime-local"> (YYYY-MM-DDTHH:mm)
function nowLocalInput(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

function PTCard() {
  const qc = useQueryClient();
  const ptQ = useQuery({
    queryKey: ["pt-taludes"],
    queryFn: async (): Promise<PTData> => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("data")
        .eq("id", PT_SETTING_ID)
        .maybeSingle();
      if (error) throw error;
      return (data?.data as PTData | undefined) ?? { liberada_em: null, historico: [] };
    },
    staleTime: 60_000,
  });

  const [obs, setObs] = useState<string>("");
  const [liberadaEmLocal, setLiberadaEmLocal] = useState<string>(() => nowLocalInput());
  const [confirmando, setConfirmando] = useState(false);

  // Ao abrir o formulário, redefine para o "agora" como sugestão inicial.
  useEffect(() => {
    if (confirmando) setLiberadaEmLocal(nowLocalInput());
  }, [confirmando]);

  const registrarMut = useMutation({
    mutationFn: async (input: { liberadaEmISO: string; observacao: string | null }) => {
      const { data: u } = await supabase.auth.getUser();
      const quem = u.user?.email ?? u.user?.id ?? null;
      const agora = new Date().toISOString();

      // Recarrega o registro mais recente para evitar sobrescrever histórico concorrente
      const { data: atual, error: readErr } = await supabase
        .from("app_settings")
        .select("data")
        .eq("id", PT_SETTING_ID)
        .maybeSingle();
      if (readErr) throw readErr;

      const anterior = (atual?.data as PTData | undefined) ?? { liberada_em: null, historico: [] };
      const novoItem: PTHistoricoItem = {
        liberada_em: input.liberadaEmISO,   // data/hora informada pelo Corpo de Bombeiros
        registrado_em: agora,               // instante do lançamento no sistema (auditoria)
        registrado_por: quem,
        observacao: input.observacao || null,
      };
      const historico = [...(anterior.historico ?? []), novoItem];

      const payload: PTData = {
        liberada_em: input.liberadaEmISO,
        observacao: input.observacao || null,
        atualizado_em: agora,
        atualizado_por: quem,
        historico,
      };

      const { error } = await supabase
        .from("app_settings")
        .upsert({ id: PT_SETTING_ID, data: payload as unknown as never });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pt-taludes"] });
      toast.success("PT liberada — registro imutável salvo");
      setObs("");
      setConfirmando(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const liberadaFmt = fmtDataHora(ptQ.data?.liberada_em);
  const historico = ptQ.data?.historico ?? [];
  const totalRegistros = historico.length;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-emerald-500/25 bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent px-4 py-3 backdrop-blur-sm transition-all hover:border-emerald-500/40">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              <ClipboardCheck className="h-3 w-3" />
              Permissão de Trabalho (PT)
              {totalRegistros > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-background/60 px-1.5 py-[1px] text-[9px] font-medium text-muted-foreground">
                  <Lock className="h-2.5 w-2.5" /> imutável
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-baseline gap-2">
              {liberadaFmt ? (
                <>
                  <span className="font-display text-lg font-semibold text-foreground">
                    {liberadaFmt}
                  </span>
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">liberada</span>
                </>
              ) : (
                <span className="text-sm italic text-muted-foreground">
                  Nenhuma liberação registrada — informe a data/hora da PT liberada pelos Bombeiros.
                </span>
              )}
            </div>
            {ptQ.data?.observacao && (
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {ptQ.data.observacao}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {totalRegistros > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <History className="h-3.5 w-3.5" />
                  Histórico
                  <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium">
                    {totalRegistros}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="border-b border-border/40 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Histórico de liberações
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Registros somente-leitura, ordenados do mais recente
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {[...historico].reverse().map((h, i) => (
                    <div
                      key={`${h.registrado_em}-${i}`}
                      className="flex flex-col gap-0.5 border-b border-border/30 px-3 py-2 last:border-b-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-medium text-foreground">
                          {fmtDataHora(h.liberada_em)}
                        </span>
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      </div>
                      {h.registrado_por && (
                        <span className="truncate text-[10px] text-muted-foreground">
                          por {h.registrado_por}
                        </span>
                      )}
                      {h.observacao && (
                        <span className="text-[11px] text-muted-foreground">{h.observacao}</span>
                      )}
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {!confirmando ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setConfirmando(true)}
            >
              Registrar liberação
            </Button>
          ) : null}
        </div>
      </div>

      {confirmando && (
        <div className="mt-3 grid gap-3 border-t border-border/40 pt-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Liberada pelo Corpo de Bombeiros em
            </Label>
            <Input
              type="datetime-local"
              value={liberadaEmLocal}
              onChange={(e) => setLiberadaEmLocal(e.target.value)}
              max={nowLocalInput()}
              className="h-9"
              autoFocus
            />
            <div className="mt-1 text-[10px] text-muted-foreground">
              Informe a data e horário exatos da liberação pelos Bombeiros.
            </div>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Observação (opcional)
            </Label>
            <Input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex.: PT nº 123 — equipe Alfa"
              className="h-9"
            />
            <div className="mt-1 text-[10px] text-muted-foreground">
              O registro no sistema é imutável e mantém o autor e o instante do lançamento.
            </div>
          </div>
          <div className="flex items-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfirmando(false);
                setObs("");
              }}
              disabled={registrarMut.isPending}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!liberadaEmLocal) {
                  toast.error("Informe a data e horário da liberação.");
                  return;
                }
                const iso = new Date(liberadaEmLocal).toISOString();
                if (Number.isNaN(new Date(iso).getTime())) {
                  toast.error("Data/horário inválido.");
                  return;
                }
                if (new Date(iso).getTime() > Date.now() + 60_000) {
                  toast.error("A liberação não pode ser no futuro.");
                  return;
                }
                registrarMut.mutate({ liberadaEmISO: iso, observacao: obs.trim() || null });
              }}
              disabled={registrarMut.isPending}
            >
              {registrarMut.isPending ? "Registrando…" : "Registrar liberação"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function EvidenciasChuvaCard({
  evidencias,
  onRemove,
}: {
  evidencias: ChuvaEvidencia[];
  onRemove: (id: string) => Promise<void>;
}) {
  const [preview, setPreview] = useState<ChuvaEvidencia | null>(null);
  const ordenadas = useMemo(
    () => [...evidencias].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [evidencias],
  );
  return (
    <GlassCard>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold">Evidências de chuva registradas</h3>
          <p className="text-xs text-muted-foreground">
            Imagens hospedadas no ImgBB — o Supabase armazena apenas o link, sem sobrecarregar o
            storage. Clique no card para abrir a imagem em uma nova aba.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">
          {ordenadas.length} registro{ordenadas.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {ordenadas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 py-8 text-center text-sm text-muted-foreground">
          Nenhuma evidência registrada ainda. Quando houver chuva, o sistema registra automaticamente
          e hospeda a imagem no ImgBB.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ordenadas.map((ev, idx) => {
            const hosted = ev.imagem_data_url?.startsWith("http");
            const registrado = new Date(ev.created_at);
            return (
              <div
                key={ev.id}
                className="group animate-evidence-pop flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-background/40 backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl"
                style={{ animationDelay: `${Math.min(idx * 60, 400)}ms` }}
              >
                <a
                  href={ev.imagem_data_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative block h-36 w-full overflow-hidden bg-slate-900"
                  title="Abrir imagem hospedada no ImgBB"
                >
                  <img
                    src={ev.imagem_data_url}
                    alt={`Evidência de chuva em ${fmtBR(ev.data)}`}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                  {/* Badge animado com data */}
                  <div className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-md shadow-lg transition-all group-hover:scale-105">
                    <CalendarClock className="h-3 w-3 animate-pulse" />
                    {fmtBR(ev.data)}
                  </div>

                  {hosted && (
                    <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[9px] font-bold text-white shadow-md">
                      <ExternalLink className="h-2.5 w-2.5" />
                      ImgBB
                    </div>
                  )}

                  <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[10px] text-white/90">
                    <span className="inline-flex items-center gap-1 font-medium">
                      <CloudRain className="h-3 w-3" />
                      {ev.condicao ?? "—"}
                    </span>
                    <span className="tabular-nums opacity-90">
                      {registrado.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </a>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <p className="line-clamp-3 text-xs text-foreground/90">{ev.mensagem}</p>
                  <div className="mt-auto flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">
                        {ev.temperatura != null ? `${Math.round(ev.temperatura)}°C` : "—"}
                      </span>
                      {ev.prob_chuva != null && (
                        <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 font-semibold text-blue-700 dark:text-blue-300">
                          {Math.round(ev.prob_chuva)}% chuva
                        </span>
                      )}
                      {ev.precipitacao_mm != null && ev.precipitacao_mm > 0 && (
                        <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 font-semibold text-sky-700 dark:text-sky-300">
                          {ev.precipitacao_mm.toFixed(1)}mm
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => setPreview(ev)}
                        title="Detalhes"
                      >
                        <History className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm("Remover esta evidência?")) void onRemove(ev.id);
                        }}
                        title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Evidência de chuva — {preview ? fmtBR(preview.data) : ""}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <a
                href={preview.imagem_data_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-lg border border-border/50"
              >
                <img
                  src={preview.imagem_data_url}
                  alt="Evidência"
                  className="w-full transition-transform hover:scale-[1.01]"
                />
              </a>
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-200">
                {preview.mensagem}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                <div>
                  <div className="font-semibold text-foreground">Data</div>
                  {fmtBR(preview.data)}
                </div>
                <div>
                  <div className="font-semibold text-foreground">Temperatura</div>
                  {preview.temperatura != null ? `${Math.round(preview.temperatura)}°C` : "—"}
                </div>
                <div>
                  <div className="font-semibold text-foreground">Condição</div>
                  {preview.condicao ?? "—"}
                </div>
                <div>
                  <div className="font-semibold text-foreground">Prob. chuva</div>
                  {preview.prob_chuva != null ? `${Math.round(preview.prob_chuva)}%` : "—"}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Registrado em {new Date(preview.created_at).toLocaleString("pt-BR")} · imagem hospedada externamente (ImgBB)
              </div>
              <div className="flex justify-end gap-2">
                <a href={preview.imagem_data_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Abrir no ImgBB
                  </Button>
                </a>
                <a
                  href={preview.imagem_data_url}
                  download={`evidencia-chuva-taludes-${preview.data}.png`}
                >
                  <Button variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Baixar imagem
                  </Button>
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </GlassCard>
  );
}
