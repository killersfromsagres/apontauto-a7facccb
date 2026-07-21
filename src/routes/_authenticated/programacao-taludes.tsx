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
  HardHat,
  ExternalLink,
  History,
  Lock,
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
  situationStatus,
  EXTERNAL_ACTIVITIES,
  shouldAlertExternalActivities,
  EXTERNAL_ACTIVITY_ALERT_THRESHOLD,
} from "@/lib/weather/open-meteo";
import {
  listarEvidencias,
  registrarEvidencia,
  removerEvidencia,
  type ChuvaEvidencia,
} from "@/lib/taludes-programacao/evidencias";
import { WeatherForecastStrip } from "@/components/weather-forecast-strip";

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
  const probHoje = data?.daily.precipitation_probability_max[0] ?? 0;
  const rainSumHoje = data?.daily.rain_sum[0] ?? 0;
  const status = situationStatus(probHoje);
  const alertExternal = shouldAlertExternalActivities(probHoje);

  const panelRef = useRef<HTMLDivElement>(null);

  // Evidências de chuva
  const evidenciasQ = useQuery({
    queryKey: ["taludes-chuva-evidencias"],
    queryFn: () => listarEvidencias(50),
    staleTime: 60_000,
  });
  const [registrandoEvid, setRegistrandoEvid] = useState(false);
  const handleRegistrarEvidencia = async () => {
    if (!data || !panelRef.current) return;
    setRegistrandoEvid(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(panelRef.current, {
        pixelRatio: 2,
        backgroundColor: "#0b1220",
      });
      const hoje = todayISO();
      await registrarEvidencia({
        data: hoje,
        mensagem:
          "Atividades de talude interrompidas devido a chuva — condição climática desfavorável registrada como evidência.",
        imagem_data_url: dataUrl,
        temperatura: current?.temperature_2m ?? null,
        condicao: info.label,
        precipitacao_mm: rainSumHoje,
        prob_chuva: probHoje,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `evidencia-chuva-taludes-${hoje}.png`;
      a.click();
      toast.success("Evidência de chuva registrada");
      qc.invalidateQueries({ queryKey: ["taludes-chuva-evidencias"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRegistrandoEvid(false);
    }
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

        {status.nivel === "reprogramar" && (
          <div className="rounded-xl border-2 border-red-500/60 bg-gradient-to-r from-red-500/20 to-red-600/10 px-4 py-3 shadow-lg">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <CloudRain className="mt-0.5 h-6 w-6 shrink-0 text-red-500 animate-pulse" />
                <div>
                  <p className="font-display text-base font-bold text-red-700 dark:text-red-300">
                    {status.titulo} — atividades de talude devem ser reprogramadas
                  </p>
                  <p className="text-xs text-red-800/90 dark:text-red-200/90">
                    Probabilidade de chuva hoje: {Math.round(probHoje)}%. Registre a evidência para
                    o histórico.
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRegistrarEvidencia}
                disabled={registrandoEvid || !data}
                className="shrink-0"
              >
                {registrandoEvid ? "Registrando…" : "Registrar evidência de chuva"}
              </Button>
            </div>
          </div>
        )}

        <PTCard />

        {/* Painel climático — Open-Meteo */}
        <div ref={panelRef}>
          <GlassCard className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="text-5xl leading-none">{info.emoji}</div>
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                    Clima agora — {WEATHER_LOCATION.cidade} · {WEATHER_LOCATION.bairro}
                  </div>
                  <div className="font-display text-2xl font-bold">
                    {current ? `${Math.round(current.temperature_2m)}°C` : "—"}
                    <span className="ml-3 text-base font-normal text-muted-foreground">
                      {current ? info.label : "Carregando…"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Prob. de chuva hoje: {Math.round(probHoje)}% · Chuva prevista:{" "}
                    {rainSumHoje.toFixed(1)} mm
                  </div>
                </div>
              </div>
              <Badge
                className={cn(
                  "px-3 py-1.5 text-sm",
                  status.nivel === "normal" &&
                    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                  status.nivel === "atencao" &&
                    "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                  status.nivel === "alto" &&
                    "bg-orange-500/15 text-orange-700 dark:text-orange-300",
                  status.nivel === "reprogramar" &&
                    "bg-red-500/15 text-red-700 dark:text-red-300",
                )}
              >
                {status.nivel === "normal" ? (
                  <CheckCircle2 className="mr-1 inline h-4 w-4" />
                ) : (
                  <AlertTriangle className="mr-1 inline h-4 w-4" />
                )}
                {status.titulo}
              </Badge>
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
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Última atualização:{" "}
                {data ? new Date(data.fetched_at).toLocaleString("pt-BR") : "—"}
              </span>
              <span>Fonte: Open-Meteo · atualização automática a cada 30 min</span>
            </div>
          </GlassCard>
        </div>

        {/* Próximos dias úteis */}
        <WeatherForecastStrip
          title="Previsão para os próximos dias úteis"
          subtitle="Planejamento das atividades de talude — role para ver mais dias"
        />


        {/* Inteligência operacional — atividades externas */}
        {alertExternal && (
          <GlassCard className="border border-red-500/40 bg-gradient-to-br from-red-500/10 to-transparent">
            <div className="mb-2 flex items-center gap-2">
              <HardHat className="h-4 w-4 text-red-500" />
              <h3 className="font-display text-base font-semibold text-red-700 dark:text-red-300">
                Serviços externos potencialmente impactados
              </h3>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Probabilidade de chuva hoje em {Math.round(probHoje)}% (limite de alerta:{" "}
              {EXTERNAL_ACTIVITY_ALERT_THRESHOLD}%). Reavalie a programação das atividades abaixo.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {EXTERNAL_ACTIVITIES.map((a) => (
                <Badge
                  key={a}
                  variant="outline"
                  className="border-red-400/50 bg-red-500/10 text-red-700 dark:text-red-200"
                >
                  {a}
                </Badge>
              ))}
            </div>
          </GlassCard>
        )}

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
                  Nenhuma liberação registrada — a data e hora serão capturadas automaticamente.
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
        <div className="mt-3 grid gap-3 border-t border-border/40 pt-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Observação (opcional)
            </Label>
            <Input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex.: PT nº 123 — equipe Alfa"
              className="h-9"
              autoFocus
            />
            <div className="mt-1 text-[10px] text-muted-foreground">
              A data e o horário serão registrados agora e não poderão ser alterados.
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
              onClick={() => registrarMut.mutate(obs.trim() || null)}
              disabled={registrarMut.isPending}
            >
              {registrarMut.isPending ? "Registrando…" : "Liberar agora"}
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
            Registros formais de interrupção de atividades por mau tempo — com print, data e
            mensagem explícita.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">
          {ordenadas.length} registro{ordenadas.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {ordenadas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 py-8 text-center text-sm text-muted-foreground">
          Nenhuma evidência registrada ainda. Quando o painel indicar chuva hoje, use o botão
          "Registrar evidência de chuva".
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ordenadas.map((ev) => (
            <div
              key={ev.id}
              className="group flex flex-col overflow-hidden rounded-xl border border-border/50 bg-background/30"
            >
              <button
                type="button"
                onClick={() => setPreview(ev)}
                className="relative block h-32 w-full overflow-hidden bg-slate-900"
              >
                <img
                  src={ev.imagem_data_url}
                  alt={`Evidência de chuva em ${fmtBR(ev.data)}`}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-1.5 left-2 flex items-center gap-1.5 text-xs font-semibold text-white">
                  <CloudRain className="h-3.5 w-3.5" />
                  {fmtBR(ev.data)}
                </div>
              </button>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <p className="line-clamp-3 text-xs text-foreground/90">{ev.mensagem}</p>
                <div className="mt-auto flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>
                    {ev.temperatura != null ? `${Math.round(ev.temperatura)}°C` : "—"} ·{" "}
                    {ev.condicao ?? "—"}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm("Remover esta evidência?")) void onRemove(ev.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
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
              <img
                src={preview.imagem_data_url}
                alt="Evidência"
                className="w-full rounded-lg border border-border/50"
              />
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
                Registrado em {new Date(preview.created_at).toLocaleString("pt-BR")}
              </div>
              <div className="flex justify-end">
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
