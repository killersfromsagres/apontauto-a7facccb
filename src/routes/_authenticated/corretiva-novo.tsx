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

  const loadData = async () => {
    setLoading(true);
    console.log("[CorretivaNovo] Iniciando loadData...");
    try {
      // 1. Tentar carregar as OS do Supabase
      const { data, error } = await supabase
        .from("corretiva_os")
        .select("*")
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
    });
  }, [osList, search, equipe]);

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
      title="Campo"
      description="Sistema inteligente de separação por equipe e impressão."
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
            
            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
              <Button
                variant={equipe === "todas" ? "default" : "glass"}
                size="sm"
                onClick={() => setEquipe("todas")}
                className="whitespace-nowrap"
              >
                Todas
              </Button>
              {["Elétrica", "Hidráulica", "Civil", "Chaveiro", "Pintura", "Refrigeração"].map((e) => (
                <Button
                  key={e}
                  variant={equipe === e ? "default" : "outline"}
                  size="sm"
                  onClick={() => setEquipe(e as any)}
                  className={cn("whitespace-nowrap", equipe === e && equipeStyles(e).badge)}
                >
                  {e}
                </Button>
              ))}
            </div>

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
                      <span className="truncate"><span className="opacity-60">Local:</span> {os.predio}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] md:text-xs text-muted-foreground/90">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                      <span className="truncate"><span className="opacity-60">Sala:</span> {os.local}</span>
                    </div>
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
      <OsDetailsDialog 
        os={selectedOs} 
        isOpen={!!selectedOs} 
        onClose={() => setSelectedOs(null)}
        onUpdate={loadData}
      />
    </PageShell>
  );
}
