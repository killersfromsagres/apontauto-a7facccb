import { useState, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Upload, Search, ShieldCheck, ClipboardCheck, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { readRondasExcel } from "@/lib/rondas/excel";
import { useServerFn } from "@tanstack/react-start";
import { saveRondasFromExcel } from "@/lib/rondas/rondas.functions";
import { RondaDetailsDialog } from "@/components/rondas/ronda-details-dialog";
import { RondaCalha } from "@/lib/rondas/types";

export const Route = createFileRoute("/_authenticated/rondas-calhas")({
  component: RondasCalhasPage,
});

function RondasCalhasPage() {
  const [rondas, setRondas] = useState<RondaCalha[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRonda, setSelectedRonda] = useState<RondaCalha | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  
  const saveRondasFn = useServerFn(saveRondasFromExcel);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("rondas_calhas")
        .select("*")
        .eq("status", "pendente")
        .order("predio", { ascending: true });
      
      if (error) throw error;
      setRondas(data as RondaCalha[]);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar rondas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const id = toast.loading("Processando planilha e identificando calhas...");
    
    try {
      const data = await readRondasExcel(file);
      if (data.length === 0) {
        toast.error("Nenhuma preventiva de calha encontrada na planilha.", { id });
        return;
      }

      await saveRondasFn({ data });
      toast.success(`${data.length} preventivas de calha importadas com sucesso!`, { id });
      loadData();
    } catch (err) {
      toast.error("Erro ao importar planilha.", { id });
    } finally {
      setIsImporting(false);
    }
  };

  const filtered = useMemo(() => {
    return rondas.filter(r => 
      r.predio.toLowerCase().includes(search.toLowerCase()) ||
      r.preventiva_nome.toLowerCase().includes(search.toLowerCase())
    );
  }, [rondas, search]);

  return (
    <PageShell 
      title="Rondas de Calhas" 
      description="Inspeção mensal inteligente de calhas por prédio."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="glass" size="sm" className="gap-2 bg-primary/20 text-primary-glow border-primary/40 relative">
            <Upload className="h-4 w-4" />
            Importar Preventivas
            <Input 
              type="file" 
              accept=".xlsx,.xls" 
              className="absolute inset-0 opacity-0 cursor-pointer" 
              onChange={handleImport}
              disabled={isImporting}
            />
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <GlassCard className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por Prédio..."
              className="pl-9 h-11 bg-white/5 border-white/10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </GlassCard>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground animate-pulse">Carregando inspeções pendentes...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-3xl bg-white/2 space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
              <ClipboardCheck className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-white font-medium">Nenhuma ronda pendente</p>
              <p className="text-xs text-muted-foreground mt-1">Importe a planilha de preventivas para começar.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((ronda) => (
              <GlassCard 
                key={ronda.id} 
                className="p-5 group cursor-pointer hover:bg-white/[0.07] transition-all border-white/10 flex flex-col"
                onClick={() => setSelectedRonda(ronda)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <Badge variant="outline" className="text-[10px] opacity-70">
                    {ronda.mes_referencia}
                  </Badge>
                </div>
                
                <h3 className="text-lg font-bold text-white group-hover:text-primary transition-colors line-clamp-1 mb-1">
                  {ronda.predio}
                </h3>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-4">
                  {ronda.preventiva_nome}
                </p>

                <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Pendente</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 text-xs font-bold hover:bg-primary/20 text-primary">
                    Realizar Ronda
                  </Button>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {selectedRonda && (
        <RondaDetailsDialog 
          ronda={selectedRonda} 
          isOpen={!!selectedRonda} 
          onClose={() => setSelectedRonda(null)}
          onUpdate={loadData}
        />
      )}
    </PageShell>
  );
}
