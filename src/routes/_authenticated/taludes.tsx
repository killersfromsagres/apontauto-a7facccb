import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TaludeMap, TaludeMarcacao } from "@/lib/taludes/api";
import { PolygonEditor } from "@/components/taludes/polygon-editor";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import {
  CloudRain,
  Wind,
  Droplets,
  AlertTriangle,
  Map as MapIcon,
  LayoutGrid,
  Info,
  Upload,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useWeather } from "@/hooks/use-weather";
import {
  detectRain,
  weatherCodeInfo,
  situationStatus,
  WEATHER_LOCATION,
} from "@/lib/weather/open-meteo";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/taludes")({
  component: TaludesPage,
});

const db = supabase as any;
const MAX_MAP_SIZE = 50 * 1024 * 1024;
const IMAGE_LOAD_TIMEOUT_MS = 15_000;

async function requireSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Falha ao validar sua sessão: ${error.message}`);
  if (!data.session?.user) {
    throw new Error("Sua sessão expirou. Entre novamente no sistema e tente adicionar o mapa.");
  }
  return data.session;
}

async function loadImageDimensions(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      fn();
    };

    const timer = window.setTimeout(() => {
      finish(() => reject(new Error("A imagem demorou demais para carregar. Tente novamente.")));
    }, IMAGE_LOAD_TIMEOUT_MS);

    img.onload = () => {
      finish(() => {
        if (!img.naturalWidth || !img.naturalHeight) {
          reject(new Error("Não foi possível identificar as dimensões da imagem."));
          return;
        }
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      });
    };

    img.onerror = () => {
      finish(() => reject(new Error("O arquivo foi enviado, mas a imagem não pôde ser carregada.")));
    };

    img.src = url;
  });
}

function TaludesPage() {
  const queryClient = useQueryClient();
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: maps, isLoading: loadingMaps } = useQuery({
    queryKey: ["talude_maps"],
    queryFn: async () => {
      await requireSession();
      const { data, error } = await db
        .from("talude_maps")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Erro ao carregar mapas: ${error.message}`);
      return (data ?? []) as TaludeMap[];
    },
  });

  const currentMap = maps?.find((map) => map.id === selectedMapId) || maps?.[0];
  const effectiveMapId = currentMap?.id;

  const { data: marcacoes, isLoading: loadingMarcacoes } = useQuery({
    queryKey: ["talude_marcacoes", effectiveMapId],
    queryFn: async () => {
      if (!effectiveMapId) return [] as TaludeMarcacao[];
      await requireSession();
      const { data, error } = await db
        .from("talude_marcacoes")
        .select("*")
        .eq("map_id", effectiveMapId)
        .order("numero", { ascending: true });
      if (error) throw new Error(`Erro ao carregar demarcações: ${error.message}`);
      return (data ?? []).map((item: any) => ({
        ...item,
        polygon: Array.isArray(item.polygon) ? item.polygon : [],
      })) as TaludeMarcacao[];
    },
    enabled: !!effectiveMapId,
  });

  const saveMutation = useMutation({
    mutationFn: async (input: Partial<TaludeMarcacao>) => {
      if (!effectiveMapId) throw new Error("Nenhum mapa selecionado.");
      const session = await requireSession();

      if (input.id) {
        const { id, map_id: _mapId, owner_id: _ownerId, created_at: _createdAt, ...payload } = input as any;
        const { error } = await db
          .from("talude_marcacoes")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("map_id", effectiveMapId);
        if (error) throw new Error(`Erro ao atualizar demarcação: ${error.message}`);
        return { id };
      }

      const { data: maxRows, error: maxError } = await db
        .from("talude_marcacoes")
        .select("numero")
        .eq("map_id", effectiveMapId)
        .not("numero", "is", null)
        .order("numero", { ascending: false })
        .limit(1);
      if (maxError) throw new Error(`Erro ao calcular número da demarcação: ${maxError.message}`);

      const nextNumero = Number(maxRows?.[0]?.numero ?? 0) + 1;
      const { id: _id, ...payload } = input as any;
      const insertPayload = {
        ...payload,
        map_id: effectiveMapId,
        owner_id: session.user.id,
        numero: input.numero ?? nextNumero,
        polygon: input.polygon ?? [],
        cor: input.cor || "#ef4444",
        opacidade: input.opacidade ?? 0.3,
        visivel: input.visivel ?? true,
        bloqueado: input.bloqueado ?? false,
        espessura_linha: input.espessura_linha ?? 4,
        tamanho_legenda: input.tamanho_legenda ?? 1,
        numero_x: input.numero_x ?? null,
        numero_y: input.numero_y ?? null,
        numero_scale: input.numero_scale ?? 1,
        data_x: input.data_x ?? null,
        data_y: input.data_y ?? null,
        data_scale: input.data_scale ?? 1,
        numero_visivel: input.numero_visivel ?? true,
        data_visivel: input.data_visivel ?? true,
        icone_tipo: input.icone_tipo ?? null,
        icone_x: input.icone_x ?? null,
        icone_y: input.icone_y ?? null,
        icone_scale: input.icone_scale ?? 1,
        icone_visivel: input.icone_visivel ?? true,
        icone_data_x: input.icone_data_x ?? null,
        icone_data_y: input.icone_data_y ?? null,
        icone_data_scale: input.icone_data_scale ?? 1,
        icone_data_visivel: input.icone_data_visivel ?? true,
        icone_data_texto: input.icone_data_texto ?? null,
      };

      const { data, error } = await db
        .from("talude_marcacoes")
        .insert(insertPayload)
        .select("*")
        .single();
      if (error) throw new Error(`Erro ao salvar demarcação: ${error.message}`);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["talude_marcacoes", effectiveMapId] });
      toast.success("Demarcação salva com sucesso");
    },
    onError: (error: any) => {
      console.error("Erro ao salvar demarcação:", error);
      toast.error(error?.message || "Erro ao salvar demarcação");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await requireSession();
      const { error } = await db
        .from("talude_marcacoes")
        .delete()
        .eq("id", id);
      if (error) throw new Error(`Erro ao excluir demarcação: ${error.message}`);
      return { ok: true };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["talude_marcacoes", effectiveMapId] });
    },
    onError: (error: any) => {
      toast.error(error?.message || "Erro ao excluir demarcação");
    },
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem válido.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_MAP_SIZE) {
      toast.error("O mapa excede o limite de 50 MB.");
      event.target.value = "";
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading("Enviando e preparando o mapa...");
    let uploadedPath: string | null = null;
    let mapCreated = false;

    try {
      const session = await requireSession();
      const originalExt = file.name.split(".").pop()?.toLowerCase() || "png";
      const safeExt = originalExt.replace(/[^a-z0-9]/g, "") || "png";
      const uniqueId = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      uploadedPath = `taludes/${uniqueId}.${safeExt}`;

      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(uploadedPath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });
      if (uploadError) {
        throw new Error(`Falha no upload do mapa: ${uploadError.message}`);
      }

      const { data: publicData } = supabase.storage
        .from("images")
        .getPublicUrl(uploadedPath);
      const publicUrl = publicData.publicUrl;
      if (!publicUrl) throw new Error("O Supabase não retornou a URL pública do mapa.");

      const dimensions = await loadImageDimensions(publicUrl);
      const cleanName = file.name.replace(/\.[^/.]+$/, "").trim() || "Mapa de Taludes";

      const { data: newMap, error: insertError } = await db
        .from("talude_maps")
        .insert({
          owner_id: session.user.id,
          nome: cleanName,
          image_url: publicUrl,
          image_width: dimensions.width,
          image_height: dimensions.height,
        })
        .select("*")
        .single();
      if (insertError) {
        throw new Error(`O arquivo foi enviado, mas o mapa não pôde ser registrado: ${insertError.message}`);
      }

      mapCreated = true;
      setSelectedMapId(newMap.id);
      await queryClient.invalidateQueries({ queryKey: ["talude_maps"] });
      await queryClient.invalidateQueries({ queryKey: ["talude_marcacoes", newMap.id] });
      toast.success("Mapa adicionado com sucesso. As demarcações foram carregadas.", { id: toastId });
    } catch (error: any) {
      console.error("[Taludes] Erro ao adicionar mapa:", error);
      if (uploadedPath && !mapCreated) {
        const { error: cleanupError } = await supabase.storage.from("images").remove([uploadedPath]);
        if (cleanupError) console.warn("[Taludes] Falha ao remover upload órfão:", cleanupError);
      }
      toast.error(error?.message || "Erro ao adicionar mapa.", { id: toastId, duration: 8000 });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <PageShell
      title="Gestão de Taludes e Clima"
      description="Monitoramento avançado de áreas de risco e condições climáticas em tempo real."
    >
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100dvh-10rem)]">
        <div className="lg:col-span-1 flex flex-col gap-6 overflow-y-auto pr-2">
          <WeatherWidget />
          <GlassCard className="p-4">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-400" />
              Resumo do Mapa
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Áreas Demarcadas</span>
                <span className="font-medium">{marcacoes?.length || 0}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Risco Identificado</span>
                <span className="font-medium text-amber-400">Moderado</span>
              </div>
              <div className="pt-2 border-t border-white/5">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  As demarcações são atualizadas em tempo real pela equipe técnica. Em caso de chuva intensa ({">"}10mm/h), as atividades nos taludes devem ser suspensas.
                </p>
              </div>
            </div>
          </GlassCard>
          <AlertsWidget />
        </div>

        <div className="lg:col-span-3 flex flex-col h-full">
          <Tabs defaultValue="mapa" className="flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <TabsList className="bg-slate-900/50 border border-white/5">
                <TabsTrigger value="mapa" className="gap-2">
                  <MapIcon className="h-4 w-4" /> Mapa
                </TabsTrigger>
                <TabsTrigger value="grade" className="gap-2">
                  <LayoutGrid className="h-4 w-4" /> Listagem
                </TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-white/10 bg-white/5"
                  onClick={() => fileInputRef.current?.click()}
                  loading={isUploading}
                  disabled={isUploading}
                >
                  <Plus className="h-4 w-4" /> {isUploading ? "Adicionando..." : "Novo Mapa"}
                </Button>
                <div className="text-xs text-muted-foreground hidden sm:block">
                  Sincronizado com: <span className="text-emerald-400 font-mono">Open-Meteo V2</span>
                </div>
              </div>
            </div>

            {maps && maps.length > 1 && (
              <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-none">
                {maps.map((map) => (
                  <button
                    key={map.id}
                    onClick={() => setSelectedMapId(map.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ${
                      selectedMapId === map.id || (!selectedMapId && maps[0].id === map.id)
                        ? "bg-blue-500/20 border-blue-500 text-blue-200"
                        : "bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10"
                    }`}
                  >
                    {map.nome}
                  </button>
                ))}
              </div>
            )}

            <TabsContent value="mapa" className="flex-1 m-0 p-0 relative rounded-xl overflow-hidden border border-white/5 bg-slate-950 shadow-2xl min-h-[500px]">
              {loadingMaps || loadingMarcacoes ? (
                <div className="w-full h-full flex items-center justify-center bg-slate-900">
                  <div className="text-center space-y-4">
                    <CloudRain className="h-12 w-12 text-blue-500 animate-bounce mx-auto" />
                    <p className="text-sm text-muted-foreground animate-pulse">Carregando dados geoespaciais...</p>
                  </div>
                </div>
              ) : currentMap ? (
                <PolygonEditor
                  imageUrl={currentMap.image_url}
                  imageWidth={currentMap.image_width || 3828}
                  imageHeight={currentMap.image_height || 3163}
                  marcacoes={marcacoes || []}
                  onSave={async (marcacao) => { await saveMutation.mutateAsync(marcacao); }}
                  onDelete={async (id) => { await deleteMutation.mutateAsync(id); }}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-6 p-8 text-center">
                  <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center mb-2">
                    <MapIcon className="h-10 w-10 opacity-40" />
                  </div>
                  <div className="max-w-md space-y-2">
                    <h3 className="text-lg font-medium text-white">Nenhum mapa configurado</h3>
                    <p className="text-sm">Carregue a planta limpa do local. As demarcações históricas serão aplicadas automaticamente.</p>
                  </div>
                  <Button
                    variant="premium"
                    onClick={() => fileInputRef.current?.click()}
                    loading={isUploading}
                    disabled={isUploading}
                    className="gap-2"
                  >
                    <Upload className="h-4 w-4" /> {isUploading ? "Adicionando mapa..." : "Carregar Primeiro Mapa"}
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="grade" className="flex-1 m-0">
              <GlassCard className="h-full overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase text-muted-foreground bg-white/5">
                    <tr>
                      <th className="px-6 py-3">Talude</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {marcacoes?.map((marcacao) => (
                      <tr key={marcacao.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-medium">{marcacao.nome || `Talude ${marcacao.numero ?? "—"}`}</td>
                        <td className="px-6 py-4">
                          <span className="flex items-center gap-1 text-emerald-400">
                            <div className="h-2 w-2 rounded-full bg-emerald-400" /> Monitorado
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => deleteMutation.mutate(marcacao.id)}
                            className="text-red-400 hover:text-red-300 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {(!marcacoes || marcacoes.length === 0) && (
                      <tr>
                        <td colSpan={3} className="px-6 py-10 text-center text-muted-foreground italic">
                          Nenhuma demarcação registrada neste mapa.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </GlassCard>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PageShell>
  );
}

function WeatherWidget() {
  const { data, isLoading, isError, refetch } = useWeather();

  if (isLoading) {
    return (
      <GlassCard className="p-4 bg-blue-500/5 animate-pulse">
        <div className="h-20 w-full bg-white/5 rounded-lg mb-4" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-10 bg-white/5 rounded" />
          <div className="h-10 bg-white/5 rounded" />
          <div className="h-10 bg-white/5 rounded" />
        </div>
      </GlassCard>
    );
  }

  if (isError || !data) {
    return (
      <GlassCard className="p-4 border-red-500/20 bg-red-500/5">
        <div className="flex flex-col items-center justify-center text-center py-4">
          <AlertTriangle className="h-8 w-8 text-red-400 mb-2" />
          <p className="text-xs text-red-200">Erro ao carregar clima</p>
          <Button variant="ghost" size="sm" className="mt-2 text-[10px] hover:bg-white/5" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Tentar novamente
          </Button>
        </div>
      </GlassCard>
    );
  }

  const current = data.current;
  const chuva = detectRain(data);
  const info = weatherCodeInfo(current.weather_code);

  return (
    <GlassCard className={cn(
      "p-4 bg-gradient-to-br border-white/10 transition-all duration-500",
      chuva.detected
        ? "from-red-500/20 to-slate-900/40 border-red-500/30"
        : "from-blue-500/15 to-slate-900/40 border-blue-500/20",
    )}>
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-baseline gap-2">
            <h2 className="text-3xl font-black tracking-tighter tabular-nums">{Math.round(current.temperature_2m)}°</h2>
            <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Celsius</span>
          </div>
          <p className="text-[10px] font-medium text-muted-foreground mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            {WEATHER_LOCATION.bairro}, {WEATHER_LOCATION.cidade}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-2xl" title={info.label}>{info.emoji}</span>
          <span className="text-[9px] font-bold text-white/30 uppercase mt-1 tracking-tighter">{info.label}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center p-2 rounded-xl bg-white/5 border border-white/5">
          <Droplets className="h-3.5 w-3.5 mb-1.5 text-blue-400" />
          <p className="text-[8px] text-white/40 font-bold uppercase tracking-widest">Umidade</p>
          <p className="text-xs font-black tabular-nums">{Math.round(current.relative_humidity_2m)}%</p>
        </div>
        <div className="flex flex-col items-center p-2 rounded-xl bg-white/5 border border-white/5">
          <Wind className="h-3.5 w-3.5 mb-1.5 text-blue-400" />
          <p className="text-[8px] text-white/40 font-bold uppercase tracking-widest">Vento</p>
          <p className="text-xs font-black tabular-nums">{Math.round(current.wind_speed_10m)}<span className="text-[8px] ml-0.5">km/h</span></p>
        </div>
        <div className="flex flex-col items-center p-2 rounded-xl bg-white/5 border border-white/5">
          <CloudRain className={cn("h-3.5 w-3.5 mb-1.5", chuva.detected ? "text-red-400 animate-bounce" : "text-blue-400")} />
          <p className="text-[8px] text-white/40 font-bold uppercase tracking-widest">Chuva</p>
          <p className="text-xs font-black tabular-nums">{chuva.mm_atual.toFixed(1)}<span className="text-[8px] ml-0.5">mm</span></p>
        </div>
      </div>

      {chuva.detected && (
        <div className="mt-4 p-2 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />
          <p className="text-[10px] font-bold text-red-200 leading-tight">{chuva.label.toUpperCase()} DETECTADA: OPERAÇÃO SUSPENSA</p>
        </div>
      )}
    </GlassCard>
  );
}

function AlertsWidget() {
  const { data } = useWeather();
  if (!data) return null;

  const probHoje = data.daily.precipitation_probability_max[0] ?? 0;
  const chuva = detectRain(data);
  situationStatus(probHoje);
  const alerts: Array<{ id: string; title: string; desc: string; variant: "danger" | "warning" | "info" }> = [];

  if (chuva.detected) {
    alerts.push({
      id: "rain-now",
      title: `Chuva em curso: ${chuva.label}`,
      desc: `Precipitação de ${chuva.mm_atual.toFixed(1)}mm detectada. Pare todas as atividades.`,
      variant: "danger",
    });
  } else if (probHoje >= 60) {
    alerts.push({
      id: "high-prob",
      title: "Risco Elevado de Chuva",
      desc: `Probabilidade de ${probHoje}% para hoje. Monitore constantemente.`,
      variant: "warning",
    });
  }

  if (chuva.mm_acumulado_3h > 5) {
    alerts.push({
      id: "soil-saturation",
      title: "Saturação do Solo",
      desc: `Acumulado de ${chuva.mm_acumulado_3h.toFixed(1)}mm nas últimas 3h. Risco de deslizamento aumentado.`,
      variant: "danger",
    });
  } else {
    alerts.push({
      id: "soil-stable",
      title: "Nível do Solo: Estável",
      desc: "Monitoramento de umidade dentro da normalidade operacional.",
      variant: "info",
    });
  }

  return (
    <GlassCard className="p-4 border-white/5 bg-white/2 shadow-inner">
      <h3 className="text-[11px] font-black uppercase tracking-widest mb-4 flex items-center gap-2 text-white/60">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Centro de Alertas
      </h3>
      <div className="space-y-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={cn(
              "p-3 rounded-xl border transition-all duration-300",
              alert.variant === "danger"
                ? "bg-red-500/10 border-red-500/20"
                : alert.variant === "warning"
                  ? "bg-amber-500/10 border-amber-500/20"
                  : "bg-white/5 border-white/5",
            )}
          >
            <p className={cn(
              "text-[10px] font-black uppercase tracking-tight",
              alert.variant === "danger"
                ? "text-red-400"
                : alert.variant === "warning"
                  ? "text-amber-400"
                  : "text-blue-400",
            )}>
              {alert.title}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed font-medium">{alert.desc}</p>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function Trash2({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}
