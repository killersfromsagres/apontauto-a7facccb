import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  CloudRain,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Umbrella,
  X,
} from "lucide-react";
import { toast } from "sonner";

import type { TaludeMarcacao } from "@/lib/taludes/api";
import {
  buildTaludeSchedule,
  fetchTaludePlanningForecast,
  formatPlanningDate,
  type TaludePlanningResult,
} from "@/lib/taludes/planning";
import { Button } from "@/components/ui/button";
import { PolygonEditorPro } from "./polygon-editor-pro";

interface PolygonEditorProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  marcacoes: TaludeMarcacao[];
  onSave: (marcacao: Partial<TaludeMarcacao>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function formatShortDate(value?: string | null) {
  const raw = value?.split(" - ")[1] ?? "";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}` : raw || "Sem data";
}

function extractStartDate(value?: string | null) {
  const raw = value?.split(" - ")[1] ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 10);
}

function formatUpdatedAt(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Fachada estável do editor de Taludes.
 *
 * Mantém os controles operacionais fora da árvore SVG do editor para evitar
 * regressões em desenho, pan/zoom e movimentação de etiquetas.
 */
export function PolygonEditor(props: PolygonEditorProps) {
  const [datePanelOpen, setDatePanelOpen] = useState(false);
  const [planningPanelOpen, setPlanningPanelOpen] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [planningId, setPlanningId] = useState<string>("");
  const [planningStartDate, setPlanningStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [planningDuration, setPlanningDuration] = useState("5");
  const [includeSaturday, setIncludeSaturday] = useState(false);
  const [includeSunday, setIncludeSunday] = useState(false);
  const [rainProbability, setRainProbability] = useState("60");
  const [rainMm, setRainMm] = useState("0.1");
  const [isPlanning, setIsPlanning] = useState(false);
  const [planningResult, setPlanningResult] = useState<TaludePlanningResult | null>(null);

  const selectedPlanning = useMemo(
    () => props.marcacoes.find((marking) => marking.id === planningId) ?? null,
    [planningId, props.marcacoes],
  );

  useEffect(() => {
    if (!props.marcacoes.length) {
      setPlanningId("");
      return;
    }
    if (!planningId || !props.marcacoes.some((marking) => marking.id === planningId)) {
      setPlanningId(props.marcacoes[0].id);
    }
  }, [planningId, props.marcacoes]);

  useEffect(() => {
    if (!selectedPlanning) return;
    setPlanningStartDate(extractStartDate(selectedPlanning.rotulo));
    setPlanningDuration(String(selectedPlanning.duracao_dias ?? 5));
    setIncludeSaturday(Boolean(selectedPlanning.considerar_sabado));
    setIncludeSunday(Boolean(selectedPlanning.considerar_domingo));
    setRainProbability(String(selectedPlanning.chuva_prob_limite ?? 60));
    setRainMm(String(selectedPlanning.chuva_mm_limite ?? 0.1));
    setPlanningResult(null);
  }, [selectedPlanning?.id]);

  const toggleDateVisibility = async (marking: TaludeMarcacao) => {
    const showDate = marking.data_visivel === false;
    setSavingId(marking.id);

    try {
      await props.onSave({
        id: marking.id,
        data_visivel: showDate,
        ...(showDate ? {} : { numero_visivel: true }),
      });

      toast.success(
        showDate
          ? `Data do Talude ${marking.numero ?? "—"} exibida novamente.`
          : `Data do Talude ${marking.numero ?? "—"} ocultada. O número foi mantido no mapa.`,
      );
    } catch (error) {
      console.error("[Taludes] Falha ao alterar visibilidade da data:", error);
      toast.error("Não foi possível alterar a visibilidade da data.");
    } finally {
      setSavingId(null);
    }
  };

  const handleAutomaticPlanning = async () => {
    if (!selectedPlanning) {
      toast.error("Selecione um talude para calcular as datas.");
      return;
    }

    const duration = Math.trunc(Number(planningDuration));
    const probability = Math.round(Number(rainProbability));
    const precipitationMm = Number(rainMm.replace(",", "."));

    if (!/^\d{4}-\d{2}-\d{2}$/.test(planningStartDate)) {
      toast.error("Informe uma data de início válida.");
      return;
    }
    if (!Number.isFinite(duration) || duration < 1 || duration > 365) {
      toast.error("Informe entre 1 e 365 dias de execução.");
      return;
    }
    if (!Number.isFinite(probability) || probability < 0 || probability > 100) {
      toast.error("O limite de probabilidade de chuva deve ficar entre 0% e 100%.");
      return;
    }
    if (!Number.isFinite(precipitationMm) || precipitationMm < 0) {
      toast.error("Informe um limite de precipitação válido.");
      return;
    }

    setIsPlanning(true);
    const toastId = toast.loading("Consultando clima e montando o cronograma do talude...");

    try {
      const forecastDays = await fetchTaludePlanningForecast();
      const result = buildTaludeSchedule({
        startDate: planningStartDate,
        durationDays: duration,
        includeSaturday,
        includeSunday,
        rainProbabilityThreshold: probability,
        rainMmThreshold: precipitationMm,
        forecastDays,
      });

      const currentStatus = selectedPlanning.rotulo?.split(" - ")[0]?.trim() || "Programado";
      await props.onSave({
        id: selectedPlanning.id,
        rotulo: `${currentStatus} - ${planningStartDate}`,
        prazo_rotulo: result.endDate,
        planejamento_automatico: true,
        duracao_dias: duration,
        considerar_sabado: includeSaturday,
        considerar_domingo: includeSunday,
        chuva_prob_limite: probability,
        chuva_mm_limite: precipitationMm,
        planejamento_atualizado_em: result.summary.generatedAt,
        planejamento_previsao_ate: result.summary.forecastHorizonEnd,
        planejamento_provisorio: result.hasProvisionalWeather,
        planejamento_resumo: result.summary,
      });

      setPlanningResult(result);
      toast.success(
        result.hasProvisionalWeather
          ? `Datas calculadas até ${formatPlanningDate(result.endDate)}. Parte do período ainda está fora da janela meteorológica.`
          : `Planejamento calculado com término em ${formatPlanningDate(result.endDate)}.`,
        { id: toastId, duration: 6500 },
      );
    } catch (error) {
      console.error("[Taludes] Falha no planejamento automático:", error);
      toast.error((error as Error)?.message || "Não foi possível calcular o planejamento automático.", {
        id: toastId,
        duration: 8000,
      });
    } finally {
      setIsPlanning(false);
    }
  };

  const storedSummary = planningResult?.summary ?? selectedPlanning?.planejamento_resumo ?? null;
  const plannedEndDate = planningResult?.endDate ?? selectedPlanning?.prazo_rotulo ?? null;
  const skippedDays = planningResult?.timeline.filter((day) => !day.counted) ?? [];
  const lastUpdated = formatUpdatedAt(selectedPlanning?.planejamento_atualizado_em);

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-slate-950">
      <div className="h-full min-h-0 w-full">
        <PolygonEditorPro {...props} />
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[70] flex flex-col items-start gap-2">
        {datePanelOpen && (
          <div className="pointer-events-auto w-[min(330px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-3 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-cyan-300" />
                  <p className="text-xs font-extrabold text-white">Datas no mapa</p>
                </div>
                <p className="mt-1 text-[9px] leading-relaxed text-white/40">
                  Oculte somente a data para ganhar espaço. Número, polígono e histórico continuam salvos.
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" onClick={() => setDatePanelOpen(false)} title="Fechar">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="max-h-[42vh] space-y-1.5 overflow-y-auto p-2.5">
              {props.marcacoes.map((marking) => {
                const hidden = marking.data_visivel === false;
                const saving = savingId === marking.id;
                return (
                  <div key={marking.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] p-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 min-w-7 place-items-center rounded-lg border border-white/10 bg-black/30 px-1.5 text-[10px] font-black text-white">
                          {marking.numero ?? "—"}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[10px] font-bold text-white/85">Talude {marking.numero ?? "—"}</p>
                          <p className="truncate text-[9px] text-white/40">{formatShortDate(marking.rotulo)} · {hidden ? "data oculta" : "data visível"}</p>
                        </div>
                      </div>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant={hidden ? "outline" : "ghost"}
                      className="h-8 gap-1.5 px-2.5 text-[9px]"
                      disabled={Boolean(savingId)}
                      onClick={() => void toggleDateVisibility(marking)}
                      title={hidden ? "Mostrar data deste talude" : "Ocultar data e manter o número"}
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      {hidden ? "Mostrar" : "Ocultar"}
                    </Button>
                  </div>
                );
              })}

              {!props.marcacoes.length && <p className="px-3 py-6 text-center text-[10px] text-white/35">Nenhum talude demarcado neste mapa.</p>}
            </div>
          </div>
        )}

        {planningPanelOpen && (
          <div className="pointer-events-auto w-[min(410px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-cyan-300/15 bg-slate-950/97 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] bg-gradient-to-r from-cyan-400/[0.055] to-transparent px-3.5 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-cyan-300" />
                  <p className="text-xs font-extrabold text-white">Planejamento automático</p>
                </div>
                <p className="mt-1 text-[9px] leading-relaxed text-white/42">
                  Calcula o término considerando expediente, feriados e chuva prevista para Demarchi.
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" onClick={() => setPlanningPanelOpen(false)} title="Fechar">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="max-h-[68vh] space-y-3 overflow-y-auto p-3.5">
              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-white/45">Talude</label>
                <select
                  value={planningId}
                  onChange={(event) => setPlanningId(event.target.value)}
                  className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.045] px-3 text-[11px] font-bold text-white outline-none focus:border-cyan-300/35"
                >
                  {props.marcacoes.map((marking) => (
                    <option key={marking.id} value={marking.id} className="bg-slate-950">
                      Talude {marking.numero ?? "—"} · {formatShortDate(marking.rotulo)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedPlanning ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1.5">
                      <span className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-white/45">Início</span>
                      <input
                        type="date"
                        value={planningStartDate}
                        onChange={(event) => setPlanningStartDate(event.target.value)}
                        className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.045] px-2.5 text-[10px] font-bold text-white outline-none focus:border-cyan-300/35"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-white/45">Dias de execução</span>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={planningDuration}
                        onChange={(event) => setPlanningDuration(event.target.value)}
                        className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.045] px-3 text-[11px] font-black text-white outline-none focus:border-cyan-300/35"
                      />
                    </label>
                  </div>

                  <div className="rounded-xl border border-white/[0.075] bg-white/[0.025] p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                      <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-white/60">Calendário operacional</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.07] bg-black/15 px-2.5 py-2 text-[9px] font-semibold text-white/65">
                        <input type="checkbox" checked={includeSaturday} onChange={(event) => setIncludeSaturday(event.target.checked)} className="accent-cyan-400" />
                        Trabalha sábado
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.07] bg-black/15 px-2.5 py-2 text-[9px] font-semibold text-white/65">
                        <input type="checkbox" checked={includeSunday} onChange={(event) => setIncludeSunday(event.target.checked)} className="accent-cyan-400" />
                        Trabalha domingo
                      </label>
                    </div>
                    <p className="mt-2 text-[8px] leading-relaxed text-white/32">
                      Feriados nacionais, 9 de Julho, aniversário de São Bernardo do Campo, Paixão de Cristo e Corpus Christi são retirados automaticamente.
                    </p>
                  </div>

                  <div className="rounded-xl border border-sky-300/10 bg-sky-300/[0.025] p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <CloudRain className="h-3.5 w-3.5 text-sky-300" />
                      <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-white/60">Critério de chuva</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1">
                        <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-white/35">Probabilidade</span>
                        <div className="relative">
                          <input type="number" min="0" max="100" value={rainProbability} onChange={(event) => setRainProbability(event.target.value)} className="h-9 w-full rounded-lg border border-white/10 bg-black/15 px-2.5 pr-7 text-[10px] font-bold outline-none focus:border-sky-300/30" />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-white/35">%</span>
                        </div>
                      </label>
                      <label className="space-y-1">
                        <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-white/35">Precipitação</span>
                        <div className="relative">
                          <input type="number" min="0" step="0.1" value={rainMm} onChange={(event) => setRainMm(event.target.value)} className="h-9 w-full rounded-lg border border-white/10 bg-black/15 px-2.5 pr-9 text-[10px] font-bold outline-none focus:border-sky-300/30" />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-white/35">mm</span>
                        </div>
                      </label>
                    </div>
                    <p className="mt-2 text-[8px] leading-relaxed text-white/32">
                      O dia é descartado se houver código meteorológico de chuva, precipitação igual/acima do limite ou probabilidade igual/acima do percentual definido.
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="premium"
                    size="sm"
                    className="h-10 w-full gap-2 text-[10px] font-extrabold"
                    disabled={isPlanning}
                    onClick={() => void handleAutomaticPlanning()}
                  >
                    {isPlanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                    {isPlanning ? "Calculando cronograma..." : "Calcular datas automaticamente"}
                  </Button>

                  {storedSummary && plannedEndDate && (
                    <div className="space-y-2 rounded-xl border border-emerald-300/12 bg-emerald-300/[0.025] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[8px] font-extrabold uppercase tracking-[0.13em] text-emerald-300/75">Término previsto</p>
                          <p className="mt-0.5 text-base font-black tabular-nums text-white">{formatPlanningDate(plannedEndDate)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[8px] font-bold uppercase text-white/30">Duração</p>
                          <p className="mt-0.5 text-[11px] font-black text-white/80">{storedSummary.executionDays} dia(s)</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          ["Chuva", storedSummary.skippedRainDays],
                          ["Feriados", storedSummary.skippedHolidayDays],
                          ["F. semana", storedSummary.skippedWeekendDays],
                          ["Provisórios", storedSummary.provisionalExecutionDays],
                        ].map(([label, value]) => (
                          <div key={String(label)} className="rounded-lg border border-white/[0.06] bg-black/15 p-2 text-center">
                            <p className="text-[7px] font-bold uppercase tracking-wide text-white/30">{label}</p>
                            <p className="mt-1 text-[11px] font-black tabular-nums text-white/80">{value}</p>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2 text-[8px] text-white/35">
                        <span>Open-Meteo · Demarchi, São Bernardo do Campo</span>
                        {storedSummary.forecastHorizonEnd && <span>Previsão até {formatPlanningDate(storedSummary.forecastHorizonEnd)}</span>}
                      </div>
                      {lastUpdated && <p className="text-[8px] text-white/28">Último cálculo: {lastUpdated}</p>}
                    </div>
                  )}

                  {(planningResult?.hasProvisionalWeather || selectedPlanning.planejamento_provisorio) && (
                    <div className="flex gap-2 rounded-xl border border-amber-300/18 bg-amber-300/[0.05] p-3">
                      <Umbrella className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                      <div>
                        <p className="text-[9px] font-extrabold text-amber-200">Trecho provisório</p>
                        <p className="mt-0.5 text-[8px] leading-relaxed text-white/42">
                          Parte da execução está além da janela meteorológica disponível. O cronograma foi montado, mas esses dias devem ser recalculados quando entrarem na previsão de 16 dias.
                        </p>
                      </div>
                    </div>
                  )}

                  {planningResult && skippedDays.length > 0 && (
                    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
                      <div className="border-b border-white/[0.06] px-3 py-2">
                        <p className="text-[8px] font-extrabold uppercase tracking-[0.13em] text-white/45">Dias descartados no cálculo</p>
                      </div>
                      <div className="max-h-36 space-y-1 overflow-y-auto p-2">
                        {skippedDays.map((day) => (
                          <div key={`${day.date}-${day.reason}`} className="flex items-start justify-between gap-3 rounded-lg bg-black/15 px-2.5 py-2">
                            <div className="min-w-0">
                              <p className="text-[9px] font-black tabular-nums text-white/75">{formatPlanningDate(day.date)}</p>
                              <p className="truncate text-[8px] text-white/34">{day.reasonLabel}</p>
                            </div>
                            <span className="shrink-0 rounded-md border border-white/[0.07] px-1.5 py-0.5 text-[7px] font-bold uppercase text-white/40">
                              {day.reason === "chuva" ? "Chuva" : day.reason === "feriado" ? "Feriado" : "Folga"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="py-8 text-center text-[10px] text-white/35">Crie uma demarcação para usar o planejamento automático.</p>
              )}
            </div>
          </div>
        )}

        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={planningPanelOpen ? "premium" : "outline"}
            size="sm"
            className="h-9 gap-2 border-white/10 bg-slate-950/90 px-3 text-[10px] shadow-xl backdrop-blur-xl"
            onClick={() => {
              setPlanningPanelOpen((open) => !open);
              setDatePanelOpen(false);
            }}
            title="Planejar datas automaticamente"
          >
            <CalendarClock className="h-4 w-4" />
            Planejamento
            {props.marcacoes.some((marking) => marking.planejamento_provisorio) && (
              <span className="rounded-md bg-amber-300/10 px-1.5 py-0.5 text-[8px] font-black text-amber-200">provisório</span>
            )}
          </Button>

          <Button
            type="button"
            variant={datePanelOpen ? "premium" : "outline"}
            size="sm"
            className="h-9 gap-2 border-white/10 bg-slate-950/90 px-3 text-[10px] shadow-xl backdrop-blur-xl"
            onClick={() => {
              setDatePanelOpen((open) => !open);
              setPlanningPanelOpen(false);
            }}
            title="Controlar datas exibidas no mapa"
          >
            <CalendarDays className="h-4 w-4" />
            Datas
            {props.marcacoes.some((marking) => marking.data_visivel === false) && (
              <span className="rounded-md bg-amber-300/10 px-1.5 py-0.5 text-[8px] font-black text-amber-200">
                {props.marcacoes.filter((marking) => marking.data_visivel === false).length} oculta(s)
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
