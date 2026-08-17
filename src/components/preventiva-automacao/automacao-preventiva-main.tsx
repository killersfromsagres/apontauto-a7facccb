import { useQuery } from "@tanstack/react-query";
import { getAssetTree, getProgramacaoHistory } from "@/lib/preventiva/automacao/actions.functions";
import { useState } from "react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CalendarIcon, ChevronRight, ChevronDown, Download, History, Play, Layers } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export function AutomacaoPreventivaMain() {
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [expandedPredios, setExpandedPredios] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);

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
      // Simulação de geração para UI
      await new Promise(r => setTimeout(r, 2000));
      toast.success("Programação gerada com sucesso!");
      refetchHistory();
    } catch (e) {
      toast.error("Erro ao gerar programação");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-12">
      <div className="md:col-span-8 space-y-6">
        <GlassCard className="p-6">
          <div className="flex items-center gap-2 mb-6 text-primary">
            <Layers className="w-5 h-5" />
            <h2 className="text-xl font-semibold">Configurar Geração</h2>
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
              className="w-full h-12 text-lg font-bold shadow-elegant group relative overflow-hidden"
              disabled={isGenerating || selectedLocations.size === 0}
              onClick={handleGenerate}
            >
              {isGenerating ? (
                <span className="flex items-center gap-2">
                  <motion.div 
                    animate={{ rotate: 360 }} 
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  >
                    <Play className="w-5 h-5" />
                  </motion.div>
                  Processando...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Play className="w-5 h-5 fill-current" />
                  Gerar Programação Automática
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
