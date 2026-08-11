import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  getTaludeMaps, 
  getTaludeMarcacoes, 
  saveTaludeMarcacao, 
  deleteTaludeMarcacao,
  createTaludeMap,
  type TaludeMap,
  type TaludeMarcacao
} from "@/lib/taludes/api";
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
  Plus
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/taludes")({
  component: TaludesPage,
});

function TaludesPage() {
  const queryClient = useQueryClient();
  const getMapsFn = useServerFn(getTaludeMaps);
  const getMarcacoesFn = useServerFn(getTaludeMarcacoes);
  const saveMarcacaoFn = useServerFn(saveTaludeMarcacao);
  const deleteMarcacaoFn = useServerFn(deleteTaludeMarcacao);
  const createMapFn = useServerFn(createTaludeMap);


  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: maps, isLoading: loadingMaps } = useQuery({
    queryKey: ["talude_maps"],
    queryFn: () => getMapsFn(),
  });

  const currentMap = maps?.find(m => m.id === selectedMapId) || maps?.[0];
  const effectiveMapId = currentMap?.id;

  const { data: marcacoes, isLoading: loadingMarcacoes } = useQuery({
    queryKey: ["talude_marcacoes", effectiveMapId],
    queryFn: () => effectiveMapId ? getMarcacoesFn({ data: effectiveMapId }) : Promise.resolve([]),
    enabled: !!effectiveMapId,
  });

  const saveMutation = useMutation({
    mutationFn: (data: Partial<TaludeMarcacao>) => {
      if (!effectiveMapId) throw new Error("Nenhum mapa selecionado");
      return saveMarcacaoFn({ data: { ...data, map_id: effectiveMapId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["talude_marcacoes", effectiveMapId] });
      toast.success("Demarcação salva com sucesso");
    },
    onError: (error: any) => {
      console.error("Erro na mutação de salvamento:", error);
      toast.error(error.message || "Erro ao salvar demarcação");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMarcacaoFn({ data: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["talude_marcacoes", effectiveMapId] });
    }
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const toastId = toast.loading("Fazendo upload do mapa...");

    try {
      // 1. Upload image to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `taludes/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(filePath);

      // 2. Get image dimensions
      const img = new Image();
      img.src = publicUrl;
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      // 3. Create map record
      const newMap = await createMapFn({
        data: {
          nome: file.name.replace(/\.[^/.]+$/, ""),
          image_url: publicUrl,
          image_width: img.naturalWidth,
          image_height: img.naturalHeight
        }
      });

      queryClient.invalidateQueries({ queryKey: ["talude_maps"] });
      setSelectedMapId(newMap.id);
      toast.success("Mapa adicionado com sucesso!", { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error("Erro ao adicionar mapa.", { id: toastId });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };


  return (
    <PageShell
      title="Gestão de Taludes e Clima"
      description="Monitoramento avançado de áreas de risco e condições climáticas em tempo real."
    >
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100dvh-10rem)]">
        {/* Sidebar: Weather & Stats */}
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
                  As demarcações são atualizadas em tempo real pela equipe técnica. 
                  Em caso de chuva intensa ({">"}10mm/h), as atividades nos taludes devem ser suspensas.
                </p>
              </div>
            </div>
          </GlassCard>

          <AlertsWidget />
        </div>

        {/* Main Content: Map Editor */}
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
                  accept="image/*" 
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
                >
                  <Plus className="h-4 w-4" /> Novo Mapa
                </Button>
                <div className="text-xs text-muted-foreground hidden sm:block">
                  Sincronizado com: <span className="text-emerald-400 font-mono">Open-Meteo V2</span>
                </div>
              </div>
            </div>

            {maps && maps.length > 1 && (
              <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-none">
                {maps.map(map => (
                  <button
                    key={map.id}
                    onClick={() => setSelectedMapId(map.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ${
                      (selectedMapId === map.id || (!selectedMapId && maps[0].id === map.id))
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
                  onSave={async (m) => { await saveMutation.mutateAsync(m); }}
                  onDelete={async (id) => { await deleteMutation.mutateAsync(id); }}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-6 p-8 text-center">
                  <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center mb-2">
                    <MapIcon className="h-10 w-10 opacity-40" />
                  </div>
                  <div className="max-w-md space-y-2">
                    <h3 className="text-lg font-medium text-white">Nenhum mapa configurado</h3>
                    <p className="text-sm">Para iniciar a demarcação, você precisa carregar uma imagem aérea ou planta do local.</p>
                  </div>
                  <Button 
                    variant="premium" 
                    onClick={() => fileInputRef.current?.click()}
                    loading={isUploading}
                    className="gap-2"
                  >
                    <Upload className="h-4 w-4" /> Carregar Primeiro Mapa
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
                     {marcacoes?.map((m) => (
                       <tr key={m.id} className="hover:bg-white/5 transition-colors">
                         <td className="px-6 py-4 font-medium">{m.nome}</td>
                         <td className="px-6 py-4">
                           <span className="flex items-center gap-1 text-emerald-400">
                             <div className="h-2 w-2 rounded-full bg-emerald-400" /> Monitorado
                           </span>
                         </td>
                         <td className="px-6 py-4">
                           <button 
                             onClick={() => deleteMutation.mutate(m.id)}
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
  return (
    <GlassCard className="p-4 bg-gradient-to-br from-blue-500/10 to-transparent border-blue-500/20">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-bold">24°C</h2>
          <p className="text-xs text-muted-foreground">Demarchi, São Bernardo do Campo</p>
        </div>
        <CloudRain className="h-8 w-8 text-blue-400" />
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <Droplets className="h-4 w-4 mx-auto mb-1 text-blue-300" />
          <p className="text-[10px] text-muted-foreground uppercase">Umidade</p>
          <p className="text-sm font-semibold">68%</p>
        </div>
        <div className="text-center">
          <Wind className="h-4 w-4 mx-auto mb-1 text-blue-300" />
          <p className="text-[10px] text-muted-foreground uppercase">Vento</p>
          <p className="text-sm font-semibold">12km/h</p>
        </div>
        <div className="text-center">
          <CloudRain className="h-4 w-4 mx-auto mb-1 text-blue-300" />
          <p className="text-[10px] text-muted-foreground uppercase">Chuva</p>
          <p className="text-sm font-semibold">2.4mm</p>
        </div>
      </div>
    </GlassCard>
  );
}

function AlertsWidget() {
  return (
    <GlassCard className="p-4 border-amber-500/30 bg-amber-500/5">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-amber-400">
        <AlertTriangle className="h-4 w-4" />
        Alertas Climáticos
      </h3>
      <div className="space-y-3">
        <div className="p-2 rounded bg-white/5 border border-white/5">
          <p className="text-xs font-medium text-amber-200">Atenção: Chuva Moderada</p>
          <p className="text-[10px] text-muted-foreground">Previsão de 5mm para os próximos 30min.</p>
        </div>
        <div className="p-2 rounded bg-white/5 border border-white/5">
          <p className="text-xs font-medium text-blue-200">Nível do Solo: Estável</p>
          <p className="text-[10px] text-muted-foreground">Monitoramento de umidade dentro da normalidade.</p>
        </div>
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
      <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>
    </svg>
  );
}
