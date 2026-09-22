import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  CloudRain,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Trash2,
  Umbrella,
  X,
} from "lucide-react";
import { toast } from "sonner";

import type { TaludeMarcacao } from "@/lib/taludes/api";
import {
  AUTOMATIC_RAIN_MM_BLOCK,
  AUTOMATIC_RAIN_PROBABILITY_BLOCK,
  buildTaludeSchedule,
  fetchTaludePlanningForecast,
  formatPlanningDate,
  type TaludePlanningResult,
  type TaludeRainRiskLevel,
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

function storedDate(value?: string | null) {
  const raw = value?.split(" - ")[1] ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function formatShortDate(value?: string | null) {
  const raw = storedDate(value);
  if (!raw) return "Sem data";
  const [, year, month, day] = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
  return year ? `${day}/${month}` : "Sem data";
}

function extractStartDate(value?: string | null) {
  return storedDate(value) || new Date().toISOString().slice(0, 10);
}

function hasDateField(marking: TaludeMarcacao) {
  return Boolean(storedDate(marking.rotulo) || marking.prazo_rotulo || marking.icone_data_texto);
}

function statusOnly(marking: TaludeMarcacao) {
  return marking.rotulo?.split(" - ")[0]?.trim() || "Programado";
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

function riskLabel(level?: TaludeRainRiskLevel | null) {
  if (level === "critico") return "Crítico";
  if (level === "alto") return "Alto";
  if (level === "atencao") return "Atenção";
  return "Baixo";
}

/**
 * Fachada estável do editor de Taludes.
 * Controles de planejamento e datas ficam fora da árvore SVG para não interferir
 * no desenho, pan/zoom e movimentação das demarcações.
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
    setPlanningResult(null);
  }, [selectedPlanning?.id]);

  const openPlanningFor = (marking: TaludeMarcacao) => {
    setPlanningId(marking.id);
    setPlanningPanelOpen(true);
    setDatePanelOpen(false);
  };

  const toggleDateVisibility = async (marking: TaludeMarcacao) => {
    if (!hasDateField(marking)) {
      openPlanningFor(marking);
      return;
    }

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
          : `Data do Talude ${marking.numero ?? "—"} ocultada. O número foi mantido.`,
      );
    } catch (error) {
      console.error("[Taludes] Falha ao alterar visibilidade da data:", error);
      toast.error("Não foi possível alterar a visibilidade da data.");
    } finally {
      setSavingId(null);
    }
  };

  const deleteDateField = async (marking: TaludeMarcacao) => {
    if (!hasDateField(marking)) return;
    const confirmed = window.confirm(
      `Excluir o campo de data do Talude ${marking.numero ?? "—"}?\n\n` +
        "Serão removidos DE, ATÉ e o planejamento automático deste campo. O número, a área e o talude continuarão no mapa.",
    );
    if (!confirmed) return;

    setSavingId(marking.id);
    try {
      await props.onSave({
        id: marking.id,
        rotulo: statusOnly(marking),
        prazo_rotulo: null,
        data_visivel: false,
        data_x: null,
        data_y: null,
        icone_data_visivel: false,
        icone_data_texto: null,
        icone_data_x: null,
        icone_data_y: null,
        planejamento_automatico: false,
        duracao_dias: null,
        planejamento_atualizado_em: null,
        planejamento_previsao_ate: null,
        planejamento_provisorio: false,
        planejamento_resumo: null,
      });
      if (planningId === marking.id) setPlanningResult(null);
      toast.success(`Campo de data do Talude ${marking.numero ?? "—"} excluído. Área e número foram preservados.`);
    } catch (error) {
      console.error("[Taludes] Falha ao excluir campo de data:", error);
      toast.error("Não foi possível excluir o campo de data.");
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(planningStartDate)) {
      toast.error("Informe uma data de início válida.");
      return;
    }
    if (!Number.isFinite(duration) || duration < 1 || duration > 365) {
      toast.error("Informe entre 1 e 365 dias de execução.");
      return;
    }

    setIsPlanning(true);
    const toastId = toast.loading("Analisando automaticamente a chuva e montando o cronograma...");

    try {
      const forecastDays = await fetchTaludePlanningForecast();
      const result = buildTaludeSchedule({
        startDate: planningStartDate,
        durationDays: duration,
        includeSaturday,
        includeSunday,
        forecastDays,
      });

      await props.onSave({
        id: selectedPlanning.id,
        rotulo: `${statusOnly(selectedPlanning)} - ${planningStartDate}`,
        prazo_rotulo: result.endDate,
        data_visivel: true,
        planejamento_automatico: true,
        duracao_dias: duration,
        considerar_sabado: includeSaturday,
        considerar_domingo: includeSunday,
        // Mantidos no banco para auditoria/compatibilidade, mas não são mais editados manualmente.
        chuva_prob_limite: AUTOMATIC_RAIN_PROBABILITY_BLOCK,
        chuva_mm_limite: AUTOMATIC_RAIN_MM_BLOCK,
        planejamento_atualizado_em: result.summary.generatedAt,
        planejamento_previsao_ate: result.summary.forecastHorizonEnd,
        planejamento_provisorio: result.hasProvisionalWeather,
        planejamento_resumo: result.summary,
      });

      setPlanningResult(result);
      toast.success(
        result.hasProvisionalWeather
          ? `Término em ${formatPlanningDate(result.endDate)}. O sistema calculou a chuva automaticamente; parte do período ainda está fora da janela meteorológica.`
          : `Planejamento automático concluído. Término em ${formatPlanningDate(result.endDate)}.`,
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
          <div className="pointer-events-auto w-[min(370px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-3 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-cyan-300" />
                  <p className="text-xs font-extrabold text-white">Campos de data</p>
                </div>
                <p className="mt-1 text-[9px] leading-relaxed text-white/40">
                  Oculte temporariamente ou exclua somente o campo de data para eliminar duplicidades sem apagar o talude.
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" onClick={() => setDatePanelOpen(false)} title="Fechar">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="max-h-[46vh] space-y-1.5 overflow-y-auto p-2.5">
              {props.marcacoes.map((marking) => {
                const exists = hasDateField(marking);
                const hidden = exists && marking.data_visivel === false;
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
                          <p className="truncate text-[9px] text-white/40">
                            {exists ? `${formatShortDate(marking.rotulo)} · ${hidden ? "campo oculto" : "campo visível"}` : "Campo de data removido"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {exists ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant={hidden ? "outline" : "ghost"}
                            className="h-8 gap-1.5 px-2 text-[9px]"
                            disabled={Boolean(savingId)}
                            onClick={() => void toggleDateVisibility(marking)}
                            title={hidden ? "Mostrar campo de data" : "Ocultar campo de data"}
                          >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                            {hidden ? "Mostrar" : "Ocultar"}
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            className="text-red-300 hover:bg-red-500/10 hover:text-red-200"
                            disabled={Boolean(savingId)}
                            onClick={() => void deleteDateField(marking)}
                            title="Excluir somente o campo de data"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 px-2 text-[9px]" onClick={() => openPlanningFor(marking)}>
                          <CalendarClock className="h-3.5 w-3.5" /> Criar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

              {!props.marcacoes.length && <p className="px-3 py-6 text-center text-[10px] text-white/35">Nenhum talude demarcado neste mapa.</p>}
            </div>
          </div>
        )}

        {planningPanelOpen && (
          <div className="pointer-events-auto w-[min(430px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-cyan-300/15 bg-slate-950/97 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] bg-gradient-to-r from-cyan-400/[0.055] to-transparent px-3.5 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-cyan-300" />
                  <p className="text-xs font-extrabold text-white">Planejamento automático</p>
                </div>
                <p className="mt-1 text-[9px] leading-relaxed text-white/42">
                  Calcula o término com expediente, feriados e risco de chuva analisado automaticamente para Demarchi.
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" onClick={() => setPlanningPanelOpen(false)} title="Fechar">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="max-h-[70vh] space-y-3 overflow-y-auto p-3.5">
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

                  <div className="rounded-xl border border-sky-300/15 bg-sky-300/[0.035] p-3">
                    <div className="flex items-start gap-2.5">
                      <CloudRain className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-white/65">Chuva 100% automática</p>
                          <span className="rounded-md border border-emerald-300/15 bg-emerald-300/[0.06] px-1.5 py-0.5 text-[7px] font-black uppercase text-emerald-200">sem preenchimento manual</span>
                        </div>
                        <p className="mt-1.5 text-[8px] leading-relaxed text-white/40">
                          A probabilidade diária é obtida da previsão e cruzada com volume de precipitação e condição meteorológica. O sistema calcula um risco de 0 a 100 e decide automaticamente se o dia pode entrar na execução.
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                          <div className="rounded-lg border border-white/[0.06] bg-black/15 p-2">
                            <p className="text-[7px] font-bold uppercase text-white/30">Regra operacional</p>
                            <p className="mt-0.5 text-[9px] font-black text-white/75">≥ {AUTOMATIC_RAIN_PROBABILITY_BLOCK}% ou chuva prevista</p>
                          </div>
                          <div className="rounded-lg border border-white/[0.06] bg-black/15 p-2">
                            <p className="text-[7px] font-bold uppercase text-white/30">Volume impeditivo</p>
                            <p className="mt-0.5 text-[9px] font-black text-white/75">≥ {AUTOMATIC_RAIN_MM_BLOCK.toFixed(1)} mm</p>
                          </div>
                        </div>
                      </div>
                    </div>
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
                    {isPlanning ? "Analisando clima e calculando..." : "Calcular datas automaticamente"}
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

                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="rounded-lg border border-sky-300/10 bg-sky-300/[0.025] p-2 text-center">
                          <p className="text-[7px] font-bold uppercase tracking-wide text-white/30">Maior prob.</p>
                          <p className="mt-1 text-[11px] font-black tabular-nums text-sky-200">{storedSummary.highestRainProbability ?? 0}%</p>
                        </div>
                        <div className="rounded-lg border border-sky-300/10 bg-sky-300/[0.025] p-2 text-center">
                          <p className="text-[7px] font-bold uppercase tracking-wide text-white/30">Risco máx.</p>
                          <p className="mt-1 text-[11px] font-black tabular-nums text-sky-200">{storedSummary.highestRainRiskScore ?? 0}/100</p>
                        </div>
                        <div className="rounded-lg border border-white/[0.06] bg-black/15 p-2 text-center">
                          <p className="text-[7px] font-bold uppercase tracking-wide text-white/30">Dias avaliados</p>
                          <p className="mt-1 text-[11px] font-black tabular-nums text-white/80">{storedSummary.evaluatedForecastDays ?? 0}</p>
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
                          Parte da execução está além da janela meteorológica disponível. Esses dias devem ser recalculados quando entrarem na previsão.
                        </p>
                      </div>
                    </div>
                  )}

                  {planningResult && skippedDays.length > 0 && (
                    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
                      <div className="border-b border-white/[0.06] px-3 py-2">
                        <p className="text-[8px] font-extrabold uppercase tracking-[0.13em] text-white/45">Dias descartados no cálculo</p>
                      </div>
                      <div className="max-h-40 space-y-1 overflow-y-auto p-2">
                        {skippedDays.map((day) => (
                          <div key={`${day.date}-${day.reason}`} className="flex items-start justify-between gap-3 rounded-lg bg-black/15 px-2.5 py-2">
                            <div className="min-w-0">
                              <p className="text-[9px] font-black tabular-nums text-white/75">{formatPlanningDate(day.date)}</p>
                              <p className="truncate text-[8px] text-white/34">{day.reasonLabel}</p>
                              {day.rainAssessment && (
                                <p className="mt-0.5 text-[8px] font-semibold text-sky-300/70">
                                  {day.rainAssessment.probability}% · risco {riskLabel(day.rainAssessment.riskLevel)} ({day.rainAssessment.riskScore}/100)
                                </p>
                              )}
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
            title="Controlar campos de data"
          >
            <CalendarDays className="h-4 w-4" />
            Datas
            {props.marcacoes.some((marking) => hasDateField(marking) && marking.data_visivel === false) && (
              <span className="rounded-md bg-amber-300/10 px-1.5 py-0.5 text-[8px] font-black text-amber-200">
                {props.marcacoes.filter((marking) => hasDateField(marking) && marking.data_visivel === false).length} oculta(s)
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
