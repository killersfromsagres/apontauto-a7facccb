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
    try {
      const { data, error } = await supabase
        .from("corretiva_os")
        .select("*")
        .order("data_criacao", { ascending: false });

      if (error) throw error;
      setOsList(data || []);
    } catch (error) {
      console.error("Erro ao carregar OS:", error);
      toast.error("Erro ao carregar ordens de serviço.");
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
      title="Nova Programação de Corretivas"
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
            <p className="text-muted-foreground">Carregando ordens de serviço...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-3xl bg-white/2">
            <p className="text-muted-foreground">Nenhuma ordem de serviço encontrada.</p>
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
                  <div className="flex items-center justify-between mb-1.5 md:mb-2">
                    <Badge variant="outline" className={cn("font-mono text-[9px] md:text-xs", equipeStyles(os.equipe).badge)}>
                      OS {os.numero_os}
                    </Badge>
                    <Badge variant="outline" className="text-[8px] md:text-[10px] opacity-70">
                      {os.equipe || "Sem Equipe"}
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-xs md:text-sm truncate group-hover:text-primary transition-colors mb-1 md:mb-2 text-white">
                    {os.nome_os || "Sem descrição"}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0.5 mt-auto text-[10px] md:text-[11px] text-muted-foreground/80">
                    <div className="truncate"><span className="opacity-50">Local:</span> {os.predio}</div>
                    <div className="truncate"><span className="opacity-50">Sala:</span> {os.local}</div>
                  </div>
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
