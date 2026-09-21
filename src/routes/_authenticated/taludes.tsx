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

function getTaludeStoragePath(imageUrl?: string | null) {
  if (!imageUrl) return null;

  try {
    const parsed = new URL(imageUrl);
    const marker = "/storage/v1/object/public/images/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return null;

    const encodedPath = parsed.pathname.slice(markerIndex + marker.length);
    return encodedPath ? decodeURIComponent(encodedPath) : null;
  } catch {
    return null;
  }
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
    onSuccess: (result, input) => {
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

  const deleteMapMutation = useMutation({
    mutationFn: async (map: TaludeMap) => {
      await requireSession();

      const { error } = await db
        .from("talude_maps")
        .delete()
        .eq("id", map.id);
      if (error) throw new Error(`Erro ao excluir mapa: ${error.message}`);

      const storagePath = getTaludeStoragePath(map.image_url);
      if (storagePath) {
        const { error: storageError } = await supabase.storage
          .from("images")
          .remove([storagePath]);
        if (storageError) {
          console.warn("[Taludes] O mapa foi excluído, mas o arquivo do Storage não pôde ser removido:", storageError);
        }
      }

      return { id: map.id };
    },
    onSuccess: async (_result, deletedMap) => {
      const nextMapId = maps?.find((map) => map.id !== deletedMap.id)?.id ?? null;
      setSelectedMapId(nextMapId);
      queryClient.removeQueries({ queryKey: ["talude_marcacoes", deletedMap.id] });
      await queryClient.invalidateQueries({ queryKey: ["talude_maps"] });
      toast.success(`Mapa “${deletedMap.nome}” excluído com sucesso.`);
    },
    onError: (error: any) => {
      console.error("[Taludes] Erro ao excluir mapa:", error);
      toast.error(error?.message || "Erro ao excluir mapa.");
    },
  });

  const handleDeleteCurrentMap = () => {
    if (!currentMap || deleteMapMutation.isPending) return;

    const confirmed = window.confirm(
      `Excluir o mapa “${currentMap.nome}”?\n\nTodas as demarcações vinculadas a este mapa também serão excluídas. Esta ação não pode ser desfeita.`,
    );
    if (!confirmed) return;

    deleteMapMutation.mutate(currentMap);
  };

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
      <div className="grid min-h-[calc(100dvh-10rem)] grid-cols-1 gap-5 lg:h-[calc(100dvh-10rem)] lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
        <div className="flex min-h-0 min-w-0 flex-col gap-5 lg:overflow-y-auto lg:overflow-x-hidden lg:pr-2">
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

        <div className="flex min-h-[620px] min-w-0 flex-col lg:min-h-0 lg:h-full">
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
                {currentMap && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-red-500/20 bg-red-500/[0.04] text-red-300 hover:border-red-500/35 hover:bg-red-500/10 hover:text-red-200"
                    onClick={handleDeleteCurrentMap}
                    loading={deleteMapMutation.isPending}
                    disabled={deleteMapMutation.isPending || isUploading}
                    title={`Excluir mapa ${currentMap.nome}`}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden sm:inline">{deleteMapMutation.isPending ? "Excluindo..." : "Excluir mapa"}</span>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-white/10 bg-white/5"
                  onClick={() => fileInputRef.current?.click()}
                  loading={isUploading}
                  disabled={isUploading || deleteMapMutation.isPending}
                >
                  <Plus className="h-4 w-4" /> {isUploading ? "Adicionando..." : "Novo Mapa"}
                </Button>
                <div className="text-xs text-muted-foreground hidden sm:block">
                  Clima: <span className="text-emerald-400 font-mono">MET Norway + Open-Meteo</span>
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

function AlertsWidget() {
  const { data } = useWeather();
  if (!data) return null;

  const probHoje = data.daily?.precipitation_probability_max?.[0] ?? 0;
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