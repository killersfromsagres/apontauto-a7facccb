import { useQuery } from "@tanstack/react-query";
import { getAssetTree, getProgramacaoHistory, saveProgramacaoHistory } from "@/lib/preventiva/automacao/actions.functions";
import { useState, useRef } from "react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { 
  CalendarIcon, 
  ChevronRight, 
  ChevronDown, 
  Download, 
  History, 
  Play, 
  Layers,
  Upload,
  FileSpreadsheet,
  Zap,
  Loader2,
  Trash2,
  Sparkles
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { readPreventivaFiles } from "@/lib/preventiva/reader";
import { triage, type Equipe } from "@/lib/preventiva/triage";
import { intelligentSchedule } from "@/lib/preventiva/automacao/intelligent-scheduler";
import { generateWeeklyProgramacao } from "@/lib/preventiva/weekly-exporter";
import { saveAs } from "file-saver";
import { useServerFn } from "@tanstack/react-start";

export function AutomacaoPreventivaMain() {
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [expandedPredios, setExpandedPredios] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [importType, setImportType] = useState<"CIVIL-HIDR-CHAV" | "REFRIG" | "ELETRICA" | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveHistory = useServerFn(saveProgramacaoHistory);

  const { data: tree, isLoading: loadingTree } = useQuery({
    queryKey: ["asset-tree"],
    queryFn: () => getAssetTree(),
  });

  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ["programacao-history"],
    queryFn: () => getProgramacaoHistory(),
  });

  const toggleLocation = (loc: string) => {
    const next = new Set(selectedLocations);
    if (next.has(loc)) next.delete(loc);
    else next.add(loc);
    setSelectedLocations(next);
  };

  const togglePredio = (p: string) => {
    const next = new Set(expandedPredios);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setExpandedPredios(next);
  };

  const handleGenerate = async () => {
    if (selectedLocations.size === 0) {
      toast.error("Selecione pelo menos um local");
      return;
    }
    setIsGenerating(true);
    try {
      // Futura implementação: gerar a partir da árvore (hoje gera a partir de planilhas)
      await new Promise(r => setTimeout(r, 2000));
      toast.info("A geração via árvore está sendo integrada com o motor de planilhas.");
      refetchHistory();
    } catch (e) {
      toast.error("Erro ao gerar programação");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !importType) return;

    setIsGenerating(true);
    const toastId = toast.loading("Processando planilhas...");
    
    try {
      // 1. Ler arquivos
      const result = await readPreventivaFiles(files);
      
      // 2. Triagem (Triage)
      const triaged = triage(result.rows);
      
      // 3. Filtrar por tipo de importação
      let filtered = triaged;
      if (importType === "CIVIL-HIDR-CHAV") {
        filtered = triaged.filter(os => ["CIVIL", "CHAVEIRO", "HIDRÁULICA"].includes(os.equipe));
      } else if (importType === "REFRIG") {
        filtered = triaged.filter(os => os.equipe.startsWith("CLIMATIZAÇÃO E REFRIGERAÇÃO"));
      } else if (importType === "ELETRICA") {
        filtered = triaged.filter(os => os.equipe === "ELÉTRICA");
      }

      if (filtered.length === 0) {
        toast.error("Nenhuma OS encontrada para os critérios selecionados.", { id: toastId });
        return;
      }

      // 4. Programação Inteligente (Scheduler)
      const schedule = intelligentSchedule(filtered, startDate);

      // 5. Gerar Excel para cada semana
      for (const bucket of schedule.buckets) {
        if (bucket.os.length === 0) continue;

        const bucketsPorEquipe = new Map<Equipe, any>();
        // Agrupa por equipe dentro do bucket da semana
        const equipesUnicas = Array.from(new Set(bucket.os.map(o => o.equipe)));
        equipesUnicas.forEach(eq => {
          const osDaEquipe = bucket.os.filter(o => o.equipe === eq);
          const porDiaDaEquipe = bucket.porDia.map(diaList => diaList.filter(o => o.equipe === eq));
          bucketsPorEquipe.set(eq as Equipe, {
            week: bucket.week,
            os: osDaEquipe,
            porDia: porDiaDaEquipe
          });
        });

        const blob = await generateWeeklyProgramacao({
          titulo: `AUTOMAÇÃO - ${importType}`,
          week: bucket.week,
          bucketsPorEquipe,
          ativoIndex: result.ativoIndex
        });

        const fileName = `Programacao_${importType}_${bucket.week.label}_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`;
        saveAs(blob, fileName);

        // Salvar histórico
        await saveHistory({
          data: {
            nome_arquivo: fileName,
            configuracao: {
              tipo: importType,
              data_inicio: startDate.toISOString(),
              filtros: Array.from(selectedLocations)
            },
            total_os: bucket.os.length,
            resumo_equipes: schedule.resumoEquipes
          }
        });
      }

      toast.success("Programação gerada e baixada com sucesso!", { id: toastId });
      refetchHistory();
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro: ${err.message || "Falha na geração"}`, { id: toastId });
    } finally {
      setIsGenerating(false);
      setImportType(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const triggerImport = (type: typeof importType) => {
    setImportType(type);
    fileInputRef.current?.click();
  };

  return (
    <div className="grid gap-6 md:grid-cols-12 max-w-7xl mx-auto">
      <div className="md:col-span-8 space-y-6">
        <GlassCard className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-cyan-400">
              <Zap className="w-6 h-6 fill-cyan-400/20 animate-pulse" />
              <h2 className="text-xl font-black tracking-tighter uppercase italic">Programação Inteligente</h2>
            </div>
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="flex items-center gap-2 px-4 py-1.5 bg-cyan-400/10 backdrop-blur-md rounded-full border border-cyan-400/30 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]"
            >
              <Sparkles className="w-4 h-4 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Motor IA Ativo</span>
            </motion.div>
          </div>

          <input 
            type="file" 
            multiple 
            accept=".xlsx,.xls" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileImport}
          />

          <div className="grid gap-4 sm:grid-cols-3 mb-8">
            <Button
              variant="glass"
              className="h-28 flex-col gap-3 border-cyan-400/20 hover:border-cyan-400/60 group relative overflow-hidden bg-cyan-400/5 hover:bg-cyan-400/10 transition-all duration-300"
              onClick={() => triggerImport("CIVIL-HIDR-CHAV")}
              disabled={isGenerating}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="p-3 rounded-2xl bg-cyan-400/10 text-cyan-400 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_20px_rgba(34,211,238,0.1)]">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <div className="text-center z-10">
                <div className="text-[11px] font-black uppercase tracking-widest text-cyan-400/90">Civil / Hidr / Chav</div>
                <div className="text-[9px] text-muted-foreground font-medium mt-1">Triagem Inteligente</div>
              </div>
            </Button>

            <Button
              variant="glass"
              className="h-28 flex-col gap-3 border-cyan-400/20 hover:border-cyan-400/60 group relative overflow-hidden bg-cyan-400/5 hover:bg-cyan-400/10 transition-all duration-300"
              onClick={() => triggerImport("REFRIG")}
              disabled={isGenerating}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="p-3 rounded-2xl bg-cyan-400/10 text-cyan-400 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_20px_rgba(34,211,238,0.1)]">
                <Zap className="w-7 h-7" />
              </div>
              <div className="text-center z-10">
                <div className="text-[11px] font-black uppercase tracking-widest text-cyan-400/90">Refrigeração</div>
                <div className="text-[9px] text-muted-foreground font-medium mt-1">Controle de Clima</div>
              </div>
            </Button>

            <Button
              variant="glass"
              className="h-28 flex-col gap-3 border-cyan-400/20 hover:border-cyan-400/60 group relative overflow-hidden bg-cyan-400/5 hover:bg-cyan-400/10 transition-all duration-300"
              onClick={() => triggerImport("ELETRICA")}
              disabled={isGenerating}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="p-3 rounded-2xl bg-cyan-400/10 text-cyan-400 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_20px_rgba(34,211,238,0.1)]">
                <Zap className="w-7 h-7" />
              </div>
              <div className="text-center z-10">
                <div className="text-[11px] font-black uppercase tracking-widest text-cyan-400/90">Elétrica</div>
                <div className="text-[9px] text-muted-foreground font-medium mt-1">Carga & Potência</div>
              </div>
            </Button>
          </div>

          <div className="flex items-center gap-2 mb-6 text-cyan-400/70 border-b border-cyan-400/10 pb-4">
            <Layers className="w-5 h-5" />
            <h2 className="text-sm font-black uppercase tracking-[0.3em]">Árvore de Ativos Operacional</h2>
          </div>


          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground uppercase tracking-wider font-bold">
                Data de Início
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="glass"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(d) => d && setStartDate(d)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground uppercase tracking-wider font-bold">
                  Seleção de Ativos (Árvore)
                </Label>
                <Button 
                  variant="link" 
                  size="sm" 
                  onClick={() => setSelectedLocations(new Set())}
                  className="text-xs"
                >
                  Limpar Seleção
                </Button>
              </div>
              
              <div className="max-h-[400px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                {loadingTree ? (
                  <div className="animate-pulse space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-10 bg-white/5 rounded-lg" />)}
                  </div>
                ) : (
                  Object.entries(tree || {}).map(([predio, andares]) => (
                    <div key={predio} className="border border-white/5 rounded-xl overflow-hidden bg-white/5">
                      <button
                        onClick={() => togglePredio(predio)}
                        className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center gap-2 font-medium">
                          {expandedPredios.has(predio) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          {predio}
                        </div>
                        <span className="text-xs text-muted-foreground bg-white/10 px-2 py-0.5 rounded-full">
                          {Object.keys(andares).length} andares
                        </span>
                      </button>
                      
                      <AnimatePresence>
                        {expandedPredios.has(predio) && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="px-4 pb-3 space-y-3"
                          >
                            {Object.entries(andares).map(([andar, locais]) => (
                              <div key={andar} className="space-y-2 pl-2 border-l border-white/10 ml-2">
                                <div className="text-xs font-bold text-primary/70 uppercase">{andar}</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {locais.map(local => {
                                    const key = `${predio}|${andar}|${local}`;
                                    return (
                                      <div key={local} className="flex items-center space-x-2 bg-black/20 p-2 rounded-lg border border-white/5">
                                        <Checkbox 
                                          id={key} 
                                          checked={selectedLocations.has(key)}
                                          onCheckedChange={() => toggleLocation(key)}
                                        />
                                        <label
                                          htmlFor={key}
                                          className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                        >
                                          {local}
                                        </label>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))
                )}
              </div>
            </div>

            <Button 
              className="w-full h-14 text-lg font-black shadow-[0_0_20px_rgba(34,211,238,0.3)] group relative overflow-hidden bg-cyan-400 hover:bg-cyan-500 text-black border-none transition-all duration-500 rounded-2xl"
              disabled={isGenerating || selectedLocations.size === 0}
              onClick={handleGenerate}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              {isGenerating ? (
                <span className="flex items-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Sincronizando...
                </span>
              ) : (
                <span className="flex items-center gap-3">
                  <Play className="w-6 h-6 fill-current" />
                  INICIAR AUTOMAÇÃO PREVENTIVA
                </span>
              )}
            </Button>
          </div>
        </GlassCard>
      </div>

      <div className="md:col-span-4 space-y-6">
        <GlassCard className="p-6">
          <div className="flex items-center gap-2 mb-6 text-emerald-400">
            <History className="w-5 h-5" />
            <h2 className="text-xl font-semibold">Histórico Recente</h2>
          </div>

          <div className="space-y-4">
            {history?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-white/5 rounded-2xl">
                Nenhuma geração encontrada
              </div>
            ) : (
              history?.map((item: any) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-primary/50 transition-all group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-medium text-sm truncate max-w-[150px]">{item.nome_arquivo}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {format(new Date(item.created_at), "dd/MM HH:mm")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                      {item.total_os} OS
                    </span>
                  </div>
                  <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-2 group-hover:bg-primary group-hover:text-white transition-colors">
                    <Download className="w-3 h-3" />
                    Baixar Novamente
                  </Button>
                </motion.div>
              ))
            )}
          </div>
        </GlassCard>

        <GlassCard className="p-6 bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
          <h3 className="text-sm font-bold uppercase tracking-wider mb-2">Dica de PCM</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            A triagem automática utiliza palavras-chave configuradas para separar Civil, Chaveiro e Hidráulica. 
            Mantenha a base de ativos atualizada para garantir a precisão dos locais.
          </p>
        </GlassCard>
      </div>
    </div>
  );
}
