import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Wrench,
  Search,
  FileSpreadsheet,
  Printer,
  ChevronDown,
  Filter,
  LayoutGrid,
  List,
  Package,
  ArrowUpDown,
  History,
  Clock,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { PreventivaImportDialog } from "@/components/corretiva/preventiva-import-dialog";
import { OsDetailsDialog } from "@/components/corretiva/os-details-dialog";
import { equipeStyles, matchEquipe, type EquipeFiltro } from "@/lib/corretiva/equipe";
import { generateProgramacaoExcel } from "@/lib/corretiva/programacao-excel";
import { generateProgramacaoPDF } from "@/lib/corretiva/programacao-pdf";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/corretiva-novo")({
  component: CorretivaNovoPage,
});

function CorretivaNovoPage() {
  const { isAdmin } = useIsAdmin();
  const [osList, setOsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [equipe, setEquipe] = useState<EquipeFiltro>("todas");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedOs, setSelectedOs] = useState<any | null>(null);
  const [sortOrder, setSortOrder] = useState<"recent" | "oldest">("recent");

  const loadData = async () => {
    setLoading(true);
    console.log("[CorretivaNovo] Iniciando loadData...");
    try {
      // 1. Tentar carregar as OS do Supabase
      const { data, error } = await supabase
        .from("corretiva_os")
        .select("*")
        .neq("tipo_importacao", "backorder_mensal")
        .order("data_criacao", { ascending: false });

      if (error) {
        console.error("[CorretivaNovo] Erro Supabase:", error);
        
        // Se der erro de permissão ou conexão, tentar ler do cache local (IndexedDB)
        console.log("[CorretivaNovo] Tentando carregar do cache local devido a erro...");
        const { getCachedOsList } = await import("@/lib/corretiva/db");
        const cached = await getCachedOsList();
        if (cached && cached.length > 0) {
          console.log(`[CorretivaNovo] Carregadas ${cached.length} OS do cache local.`);
          setOsList(cached);
          toast.info("Visualizando dados em modo offline.");
        } else {
          throw error;
        }
      } else {
        console.log(`[CorretivaNovo] Sucesso: ${data?.length || 0} OS carregadas.`);
        const list = data || [];
        setOsList(list);
        
        // Atualizar cache local em background
        if (list.length > 0) {
          const { cacheOsList } = await import("@/lib/corretiva/db");
          cacheOsList(list).catch(err => console.error("[CorretivaNovo] Erro ao cachear:", err));
        }
      }
    } catch (error: any) {
      console.error("[CorretivaNovo] Erro fatal no loadData:", error);
      toast.error(`Não foi possível carregar as OS: ${error.message || "Erro de conexão"}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = useMemo(() => {
    return osList.filter((o) => {
      const matchesSearch = 
        !search ||
        o.numero_os?.toLowerCase().includes(search.toLowerCase()) ||
        o.ativo?.toLowerCase().includes(search.toLowerCase()) ||
        o.local?.toLowerCase().includes(search.toLowerCase()) ||
        o.nome_os?.toLowerCase().includes(search.toLowerCase());
      
      const matchesEquipe = matchEquipe(o.equipe, equipe);
      
      return matchesSearch && matchesEquipe;
    }).sort((a, b) => {
      const dateA = new Date(a.data_criacao || 0).getTime();
      const dateB = new Date(b.data_criacao || 0).getTime();
      return sortOrder === "recent" ? dateB - dateA : dateA - dateB;
    });
  }, [osList, search, equipe, sortOrder]);

  const exportExcelByTeam = async () => {
    if (!filtered.length) return toast.error("Nenhuma OS para exportar.");
    try {
      await generateProgramacaoExcel(filtered, "Programacao_por_Equipe", "corretiva");
      toast.success("Excel gerado com sucesso!");
    } catch (error) {
      toast.error("Erro ao gerar Excel.");
    }
  };

  const exportPDFByTeam = async () => {
    if (!filtered.length) return toast.error("Nenhuma OS para imprimir.");
    try {
      await generateProgramacaoPDF(filtered, "Programacao_Equipes");
      toast.success("PDF preparado para impressão!");
    } catch (error) {
      toast.error("Erro ao gerar PDF.");
    }
  };

  return (
    <PageShell
      title="Programação de Corretivas"
      description="Sistema inteligente com classificação automática por IA."
      actions={
        <div className="flex items-center gap-2">
          {isAdmin && (
            <PreventivaImportDialog mode="corretiva" onDone={loadData} />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="glass" size="sm" className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Exportar / Imprimir
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportExcelByTeam} className="gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                Exportar Planilha (Equipes Separadas)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportPDFByTeam} className="gap-2">
                <Printer className="h-4 w-4 text-primary" />
                Imprimir Programação (PDF)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <div className="space-y-6">
        <GlassCard className="p-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar OS, Ativo, Local..."
                className="pl-9 h-11 bg-white/5 border-white/10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="glass" 
                    className={cn(
                      "h-11 px-6 rounded-full gap-2 border-white/10 transition-all duration-300",
                      equipe !== "todas" && equipeStyles(equipe as any).badge
                    )}
                  >
                    <Filter className="h-4 w-4" />
                    <span className="font-medium">
                      {equipe === "todas" ? "Filtrar Equipe" : equipe}
                    </span>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", "group-data-[state=open]:rotate-180")} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 p-2 bg-[#0A0A0A]/95 border-white/10 backdrop-blur-xl rounded-2xl shadow-2xl">
                  <DropdownMenuItem 
                    onClick={() => setEquipe("todas")}
                    className={cn(
                      "rounded-xl mb-1 px-4 py-2.5 cursor-pointer transition-colors",
                      equipe === "todas" ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    Todas as Equipes
                  </DropdownMenuItem>
                  {["Elétrica", "Hidráulica", "Civil", "Chaveiro", "Pintura", "Refrigeração"].map((e) => (
                    <DropdownMenuItem
                      key={e}
                      onClick={() => setEquipe(e as any)}
                      className={cn(
                        "rounded-xl mb-1 px-4 py-2.5 cursor-pointer flex items-center justify-between group transition-all",
                        equipe === e 
                          ? cn("text-white", equipeStyles(e as any).badge.replace('shadow-lg', ''))
                          : "text-white/60 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <span>{e}</span>
                      {equipe === e && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="glass" className="h-11 px-6 rounded-full gap-2 border-white/10">
                    <ArrowUpDown className="h-4 w-4" />
                    <span className="font-medium">
                      {sortOrder === "recent" ? "Mais Recentes" : "Mais Antigos"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 p-2 bg-[#0A0A0A]/95 border-white/10 backdrop-blur-xl rounded-2xl shadow-2xl">
                  <DropdownMenuItem 
                    onClick={() => setSortOrder("recent")}
                    className={cn(
                      "rounded-xl mb-1 px-4 py-2.5 cursor-pointer flex items-center gap-3 transition-colors",
                      sortOrder === "recent" ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <Clock className="h-4 w-4" />
                    Mais Recentes
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => setSortOrder("oldest")}
                    className={cn(
                      "rounded-xl mb-1 px-4 py-2.5 cursor-pointer flex items-center gap-3 transition-colors",
                      sortOrder === "oldest" ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <History className="h-4 w-4" />
                    Mais Antigos
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            </div>
          </div>
        </GlassCard>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Wrench className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground animate-pulse">Consultando banco de dados...</p>
          </div>
        ) : osList.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-3xl bg-white/2 space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-white font-medium">Nenhuma Ordem de Serviço encontrada</p>
              <p className="text-xs text-muted-foreground mt-1">Importe uma planilha ou aguarde a sincronização.</p>
            </div>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={loadData} className="mt-4">
                Tentar Recarregar
              </Button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-3xl bg-white/2">
            <p className="text-muted-foreground">Nenhuma OS corresponde aos filtros aplicados.</p>
          </div>
        ) : (
          <div className={cn(
            viewMode === "grid" 
              ? "grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-4" 
              : "flex flex-col gap-2 md:gap-3"
          )}>
            {filtered.map((os) => (
              <GlassCard 
                key={os.id} 
                className={cn(
                  "p-4 group cursor-pointer hover:bg-white/[0.07] transition-all", 
                  viewMode === "list" && "flex items-center gap-4 py-3"
                )}
                onClick={() => setSelectedOs(os)}
              >
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className={cn("font-mono text-[10px] md:text-xs", equipeStyles(os.equipe).badge)}>
                      OS {os.numero_os}
                    </Badge>
                    <Badge 
                      variant={os.status === 'concluida' ? 'secondary' : 'outline'} 
                      className={cn(
                        "text-[9px] md:text-[10px] uppercase font-bold",
                        os.status === 'concluida' ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "opacity-70"
                      )}
                    >
                      {os.status === 'concluida' ? 'Concluída' : (os.equipe || "Sem Equipe")}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-sm md:text-base leading-tight group-hover:text-primary transition-colors mb-2 text-white line-clamp-2">
                    {os.nome_os || "Sem descrição"}
                  </h3>
                  <div className="space-y-1.5 mt-auto">
                    <div className="flex items-center gap-2 text-[10px] md:text-xs text-muted-foreground/90">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                      <span className="truncate"><span className="opacity-60">Prédio/Andar:</span> {os.predio} - {os.andar}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] md:text-xs text-muted-foreground/90">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                      <span className="truncate"><span className="opacity-60">Ambiente:</span> {os.local}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] md:text-xs text-muted-foreground/90 italic">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                      <span className="truncate text-primary-glow/80"><span className="opacity-60">Solicitante:</span> {os.solicitante || "Não inf."}</span>
                    </div>
                    {os.data_criacao && (
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                        <span><span className="opacity-60">Abertura:</span> {new Date(os.data_criacao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      </div>
                    )}
                  </div>
                  {os.pecas_solicitadas && (
                    <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2 text-[10px] text-amber-400/80">
                      <Package className="h-3 w-3" />
                      <span className="truncate">Peças solicitadas</span>
                    </div>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
      {selectedOs && (
        <OsDetailsDialog 
          os={{...selectedOs, isAdmin}} 
          isOpen={!!selectedOs} 
          onClose={() => setSelectedOs(null)}
          onUpdate={loadData}
        />
      )}
    </PageShell>
  );
}
