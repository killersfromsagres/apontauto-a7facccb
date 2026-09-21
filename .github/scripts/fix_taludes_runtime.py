from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"pattern not found: {label}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"regex {label} matched {count} times")
    return updated

# ---------------------------------------------------------------------------
# Polygon editor: keep demarcation responsive and render date controls in React
# ---------------------------------------------------------------------------
pro_path = Path("src/components/taludes/polygon-editor-pro.tsx")
pro = pro_path.read_text()

pro = replace_once(
    pro,
    '  const [draggedLabel, setDraggedLabel] = useState<{ id: string; type: LabelType } | null>(null);\n',
    '  const [draggedLabel, setDraggedLabel] = useState<{ id: string; type: LabelType } | null>(null);\n  const [isSavingArea, setIsSavingArea] = useState(false);\n',
    "saving state",
)

new_finish = '''  const finishDrawing = useCallback(async () => {
    if (isSavingArea) return;
    if (currentPoints.length < 3) {
      toast.error("Marque pelo menos 3 vértices para concluir a área.");
      return;
    }

    const draftPoints = [...currentPoints];
    const centroid = getCentroid(draftPoints);
    const config = STATUS_CONFIG[statusType];

    // Fecha o modo de desenho imediatamente para a interface continuar fluida.
    // Se o servidor falhar, o rascunho é restaurado automaticamente.
    setIsSavingArea(true);
    setCurrentPoints([]);
    setHoverPoint(null);
    setMode("view");

    try {
      await onSave({
        polygon: draftPoints,
        rotulo: `${config.label} - ${statusDate}`,
        prazo_rotulo: prazoDate || null,
        cor: config.color,
        opacidade: 0.28,
        visivel: true,
        bloqueado: false,
        espessura_linha: 4,
        numero_scale: 1,
        data_scale: 1,
        numero_visivel: true,
        data_visivel: true,
        numero_cor_fundo: numeroBg,
        numero_cor_texto: numeroText,
        numero_x: centroid.x,
        numero_y: centroid.y,
        data_x: centroid.x,
        data_y: centroid.y + 46,
      });
      toast.success("Área demarcada com sucesso.");
    } catch (error) {
      console.error(error);
      setCurrentPoints(draftPoints);
      setMode("draw");
      toast.error("Erro ao salvar a demarcação. O desenho foi preservado para nova tentativa.");
    } finally {
      setIsSavingArea(false);
    }
  }, [currentPoints, isSavingArea, numeroBg, numeroText, onSave, prazoDate, statusDate, statusType]);'''

pro = regex_once(
    pro,
    r'  const finishDrawing = useCallback\(async \(\) => \{.*?\n  \}, \[currentPoints, numeroBg, numeroText, onSave, prazoDate, statusDate, statusType\]\);',
    new_finish,
    "finishDrawing",
)

pro = replace_once(pro, '<FieldLabel>Data do status</FieldLabel>', '<FieldLabel>De</FieldLabel>', "status date label")
pro = replace_once(pro, '<FieldLabel>Prazo</FieldLabel>', '<FieldLabel>Até</FieldLabel>', "deadline label")

color_grid = '''              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1"><FieldLabel>Fundo das datas</FieldLabel><input type="color" value={dateBg} onChange={(e) => persistDateColors(e.target.value, dateText)} className="h-8 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5" /></label>
                <label className="space-y-1"><FieldLabel>Texto das datas</FieldLabel><input type="color" value={dateText} onChange={(e) => persistDateColors(dateBg, e.target.value)} className="h-8 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5" /></label>
              </div>'''
scale_grid = color_grid + '''
              <div className="space-y-1.5 rounded-xl border border-white/[0.07] bg-white/[0.025] p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel>Tamanho de DE / ATÉ</FieldLabel>
                  <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 font-mono text-[9px] font-bold tabular-nums text-white/70">
                    {(selected.data_scale || 1).toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="3.5"
                  step="0.1"
                  value={selected.data_scale || 1}
                  onChange={(e) => updateLocal(selected.id, { data_scale: Number(e.target.value) })}
                  onPointerUp={() => void persistPatch(selected.id, { data_scale: local.find((m) => m.id === selected.id)?.data_scale || 1 })}
                  onKeyUp={() => void persistPatch(selected.id, { data_scale: local.find((m) => m.id === selected.id)?.data_scale || 1 })}
                  className="w-full accent-slate-300"
                  aria-label="Tamanho dos campos De e Até"
                />
              </div>'''
pro = replace_once(pro, color_grid, scale_grid, "date scale control")

pro = replace_once(
    pro,
    '<Button size="sm" variant="success" disabled={currentPoints.length < 3} onClick={() => void finishDrawing()} className="h-8 gap-1 text-[9px]"><Check /> Finalizar área</Button>',
    '<Button size="sm" variant="success" disabled={currentPoints.length < 3 || isSavingArea} loading={isSavingArea} loadingText="Salvando..." onClick={() => void finishDrawing()} className="h-8 gap-1 text-[9px]"><Check /> Finalizar área</Button>',
    "finish button",
)

pro = pro.replace('ctx.fillText("STATUS",', 'ctx.fillText("DE",')
pro = pro.replace('ctx.fillText("PRAZO",', 'ctx.fillText("ATÉ",')
pro = pro.replace('>STATUS</text>', '>DE</text>')
pro = pro.replace('>PRAZO</text>', '>ATÉ</text>')

pro_path.write_text(pro)

# ---------------------------------------------------------------------------
# Taludes route: non-blocking saves + responsive weather panel
# ---------------------------------------------------------------------------
route_path = Path("src/routes/_authenticated/taludes.tsx")
route = route_path.read_text()

old_success = '''    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["talude_marcacoes", effectiveMapId] });
      toast.success("Demarcação salva com sucesso");
    },'''
new_success = '''    onSuccess: (result, input) => {
      const queryKey = ["talude_marcacoes", effectiveMapId] as const;
      queryClient.setQueryData<TaludeMarcacao[]>(queryKey, (current = []) => {
        if (input.id) {
          return current.map((item) =>
            item.id === input.id ? ({ ...item, ...input } as TaludeMarcacao) : item,
          );
        }

        const created = result as TaludeMarcacao;
        if (!created?.id) return current;
        const normalized = {
          ...created,
          polygon: Array.isArray(created.polygon) ? created.polygon : [],
        } as TaludeMarcacao;
        return [...current.filter((item) => item.id !== normalized.id), normalized].sort(
          (a, b) => Number(a.numero ?? 0) - Number(b.numero ?? 0),
        );
      });

      // Atualiza em segundo plano, sem manter o editor bloqueado aguardando novo SELECT.
      void queryClient.invalidateQueries({ queryKey });
      toast.success("Demarcação salva com sucesso");
    },'''
route = replace_once(route, old_success, new_success, "non blocking save")

route = replace_once(
    route,
    '<div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100dvh-10rem)]">',
    '<div className="grid min-h-[calc(100dvh-10rem)] grid-cols-1 gap-5 lg:h-[calc(100dvh-10rem)] lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">',
    "page grid",
)
route = replace_once(
    route,
    '<div className="lg:col-span-1 flex flex-col gap-6 overflow-y-auto pr-2">',
    '<div className="flex min-h-0 min-w-0 flex-col gap-5 lg:overflow-y-auto lg:overflow-x-hidden lg:pr-2">',
    "sidebar grid",
)
route = replace_once(
    route,
    '<div className="lg:col-span-3 flex flex-col h-full">',
    '<div className="flex min-h-[620px] min-w-0 flex-col lg:min-h-0 lg:h-full">',
    "map grid",
)
route = route.replace('Sincronizado com: <span className="text-emerald-400 font-mono">Open-Meteo V2</span>', 'Clima: <span className="text-emerald-400 font-mono">MET Norway + Open-Meteo</span>')
route = route.replace('const probHoje = data.daily.precipitation_probability_max[0] ?? 0;', 'const probHoje = data.daily?.precipitation_probability_max?.[0] ?? 0;')

weather_widget = r'''function WeatherWidget() {
  const { data, isLoading, isError, error, refetch, isFetching } = useWeather();

  if (isLoading) {
    return (
      <GlassCard className="overflow-hidden border-white/[0.08] bg-white/[0.025] p-4">
        <div className="animate-pulse space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="h-12 w-28 rounded-xl bg-white/[0.06]" />
            <div className="h-10 w-24 rounded-xl bg-white/[0.05]" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-16 rounded-xl bg-white/[0.045]" />
            ))}
          </div>
        </div>
      </GlassCard>
    );
  }

  if (isError || !data) {
    const message = error instanceof Error ? error.message : "Não foi possível consultar as fontes meteorológicas.";
    return (
      <GlassCard className="overflow-hidden border-red-400/20 bg-red-400/[0.045] p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-red-400/20 bg-red-400/[0.07] text-red-300">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Clima temporariamente indisponível</p>
            <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{message}</p>
            <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={() => void refetch()}>
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar clima
            </Button>
          </div>
        </div>
      </GlassCard>
    );
  }

  const current = data.current;
  const chuva = detectRain(data);
  const info = weatherCodeInfo(current.weather_code);
  const temperature = Math.round(Number(current.temperature_2m ?? 0));
  const apparent = Math.round(Number(current.apparent_temperature ?? current.temperature_2m ?? 0));
  const humidity = Math.round(Number(current.relative_humidity_2m ?? 0));
  const wind = Math.round(Number(current.wind_speed_10m ?? 0));
  const rainProbability = Math.round(Number(data.daily?.precipitation_probability_max?.[0] ?? 0));
  const updatedAt = new Date(data.fetched_at);
  const updatedLabel = Number.isNaN(updatedAt.getTime())
    ? "agora"
    : updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const sourceLabel = data.source === "met.no" ? "MET Norway" : "Open-Meteo";

  const metricClass = "min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.035] p-3";

  return (
    <GlassCard
      className={cn(
        "min-w-0 overflow-hidden p-0 transition-colors duration-300",
        chuva.detected
          ? "border-red-400/25 bg-red-400/[0.045]"
          : "border-white/[0.09] bg-white/[0.025]",
      )}
    >
      <div className="p-4 sm:p-5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
              <span className="text-4xl font-bold tracking-[-0.06em] tabular-nums text-foreground">{temperature}°</span>
              <span className="pb-1 text-xs font-semibold text-muted-foreground">sensação {apparent}°C</span>
            </div>
            <p className="mt-2 break-words text-xs font-medium leading-relaxed text-muted-foreground">
              {WEATHER_LOCATION.bairro} · {WEATHER_LOCATION.cidade} / {WEATHER_LOCATION.estado}
            </p>
          </div>
          <div className="max-w-[42%] shrink-0 text-right">
            <div className="text-3xl leading-none" title={info.label}>{info.emoji}</div>
            <p className="mt-2 break-words text-[10px] font-bold uppercase leading-snug tracking-[0.08em] text-white/55">{info.label}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className={metricClass}>
            <div className="flex items-center gap-2 text-muted-foreground"><Droplets className="h-4 w-4 shrink-0" /><span className="text-[10px] font-bold uppercase tracking-[0.08em]">Umidade</span></div>
            <p className="mt-2 text-lg font-bold tabular-nums">{humidity}%</p>
          </div>
          <div className={metricClass}>
            <div className="flex items-center gap-2 text-muted-foreground"><Wind className="h-4 w-4 shrink-0" /><span className="text-[10px] font-bold uppercase tracking-[0.08em]">Vento</span></div>
            <p className="mt-2 text-lg font-bold tabular-nums">{wind}<span className="ml-1 text-[10px] font-semibold text-muted-foreground">km/h</span></p>
          </div>
          <div className={metricClass}>
            <div className="flex items-center gap-2 text-muted-foreground"><CloudRain className="h-4 w-4 shrink-0" /><span className="text-[10px] font-bold uppercase tracking-[0.08em]">Chuva agora</span></div>
            <p className="mt-2 text-lg font-bold tabular-nums">{chuva.mm_atual.toFixed(1)}<span className="ml-1 text-[10px] font-semibold text-muted-foreground">mm</span></p>
          </div>
          <div className={metricClass}>
            <div className="flex items-center gap-2 text-muted-foreground"><CloudRain className="h-4 w-4 shrink-0" /><span className="text-[10px] font-bold uppercase tracking-[0.08em]">Chance hoje</span></div>
            <p className="mt-2 text-lg font-bold tabular-nums">{rainProbability}%</p>
          </div>
        </div>

        {chuva.detected && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-400/[0.08] p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-red-200">{chuva.label}: atividade suspensa</p>
              <p className="mt-1 text-[10px] leading-relaxed text-red-100/65">Precipitação em curso. Aguarde liberação antes de retomar atividades no talude.</p>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-3">
          <p className="min-w-0 text-[10px] leading-relaxed text-muted-foreground">
            Fonte: <span className="font-semibold text-foreground/75">{sourceLabel}</span> · atualizado às {updatedLabel}
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Atualizar clima"
            loading={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}

function AlertsWidget()'''
route = regex_once(route, r'function WeatherWidget\(\) \{.*?\n\}\n\nfunction AlertsWidget\(\)', weather_widget, "WeatherWidget")

route_path.write_text(route)

# ---------------------------------------------------------------------------
# Client weather: bound each source request so fallback cannot hang forever
# ---------------------------------------------------------------------------
weather_path = Path("src/lib/weather/open-meteo.ts")
weather = weather_path.read_text()
new_fetch_from = r'''async function fetchFrom(endpoint: string, signal?: AbortSignal): Promise<WeatherResponse> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), 9000);

  try {
    const res = await fetch(endpoint, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `${endpoint.startsWith("/") ? "clima-forecast" : "open-meteo"} respondeu ${res.status}${body ? ` — ${body.slice(0, 120)}` : ""}`,
      );
    }
    const json = (await res.json()) as Omit<WeatherResponse, "fetched_at"> & { fetched_at?: string };
    if (!json?.current || !json?.hourly?.temperature_2m || !json?.daily?.time) {
      throw new Error("Resposta de clima inválida (campos ausentes).");
    }
    return { ...json, fetched_at: json.fetched_at ?? new Date().toISOString() };
  } catch (error) {
    if ((error as Error)?.name === "AbortError" && !signal?.aborted) {
      throw new Error(`${endpoint.startsWith("/") ? "clima-forecast" : "open-meteo"} excedeu 9s de resposta`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}'''
weather = regex_once(weather, r'async function fetchFrom\(endpoint: string, signal\?: AbortSignal\): Promise<WeatherResponse> \{.*?\n\}', new_fetch_from, "client fetch timeout")
weather_path.write_text(weather)

# ---------------------------------------------------------------------------
# Server weather route: independent timeout for primary and fallback sources
# ---------------------------------------------------------------------------
server_path = Path("src/routes/api/public/clima-forecast.ts")
server = server_path.read_text()
new_route = r'''async function withWeatherTimeout<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await loader(controller.signal);
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new Error(`timeout após ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/public/clima-forecast")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lat = num(url.searchParams.get("lat"), DEFAULT_LAT);
        const lon = num(url.searchParams.get("lon"), DEFAULT_LON);
        const errors: string[] = [];

        try {
          const data = await withWeatherTimeout(
            (signal) => fromMetNorway(lat, lon, signal),
            6500,
          );
          return Response.json(data, {
            headers: { "Cache-Control": CACHE_CONTROL, "Access-Control-Allow-Origin": "*" },
          });
        } catch (error) {
          errors.push(`met.no: ${(error as Error).message}`);
        }

        const tryOpenMeteo = async (retryCount = 0): Promise<Response | null> => {
          try {
            const data = await withWeatherTimeout(
              (signal) => fromOpenMeteo(lat, lon, signal),
              6500,
            );
            return Response.json(data, {
              headers: {
                "Cache-Control": CACHE_CONTROL,
                "Access-Control-Allow-Origin": "*",
                "X-Weather-Fallback": "open-meteo",
              },
            });
          } catch (error) {
            const message = (error as Error).message;
            if (message.includes("429") && retryCount < 1) {
              await new Promise((resolve) => setTimeout(resolve, 750));
              return tryOpenMeteo(retryCount + 1);
            }
            errors.push(`open-meteo: ${message}`);
            return null;
          }
        };

        const fallback = await tryOpenMeteo();
        if (fallback) return fallback;

        return Response.json(
          { error: "all_sources_failed", details: errors },
          { status: 502, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } },
        );
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
          },
        }),
    },
  },
});'''
server = regex_once(server, r'export const Route = createFileRoute\("/api/public/clima-forecast"\)\(\{.*\Z', new_route, "server weather route")
server_path.write_text(server)

print("Taludes runtime and weather fixes applied")
