import { useState, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, History, FileText, Loader2, Building2, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RondaCalha } from "@/lib/rondas/types";
import { generateRondaPDF } from "@/lib/rondas/pdf";

export const Route = createFileRoute("/_authenticated/rondas-calhas/historico")({
  component: RondasHistoricoPage,
});

function RondasHistoricoPage() {
  const [rondas, setRondas] = useState<RondaCalha[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("rondas_calhas")
        .select("*")
        .eq("status", "concluido")
        .order("realizado_em", { ascending: false });
      
      if (error) throw error;
      setRondas(data as RondaCalha[]);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar histórico.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleExportPDF = async (ronda: RondaCalha) => {
    setIsExporting(true);
    const id = toast.loading("Gerando relatório profissional...");
    try {
      await generateRondaPDF(ronda);
      toast.success("PDF gerado com sucesso!", { id });
    } catch (err) {
      toast.error("Erro ao gerar PDF.", { id });
    } finally {
      setIsExporting(false);
    }
  };

  const filtered = useMemo(() => {
    return rondas.filter(r => 
      r.predio.toLowerCase().includes(search.toLowerCase()) ||
      r.realizado_por?.toLowerCase().includes(search.toLowerCase())
    );
  }, [rondas, search]);

  return (
    <PageShell 
      title="Histórico de Rondas" 
      description="Consulte inspeções concluídas e gere relatórios profissionais."
    >
      <div className="space-y-6">
        <GlassCard className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por Prédio ou Responsável..."
              className="pl-9 h-11 bg-white/5 border-white/10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </GlassCard>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground animate-pulse">Carregando histórico...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-3xl bg-white/2 space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
              <History className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-white font-medium">Histórico vazio</p>
              <p className="text-xs text-muted-foreground mt-1">Nenhuma ronda foi concluída ainda.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((ronda) => (
              <GlassCard 
                key={ronda.id} 
                className="p-5 border-white/10 bg-emerald-500/5 group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    {ronda.mes_referencia}
                  </Badge>
                </div>
                
                <h3 className="text-lg font-bold text-white mb-1">
                  {ronda.predio}
                </h3>
                <div className="space-y-2 mb-4">
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="opacity-50 font-bold uppercase tracking-tighter text-[9px]">Por:</span>
                    <span className="text-white/80">{ronda.realizado_por}</span>
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="opacity-50 font-bold uppercase tracking-tighter text-[9px]">Em:</span>
                    <span className="text-white/80">
                      {ronda.realizado_em ? new Date(ronda.realizado_em).toLocaleDateString('pt-BR') : '-'}
                    </span>
                  </p>
                </div>

                <div className="mt-auto pt-4 border-t border-white/5 flex gap-2">
                  <Button 
                    className="flex-1 h-9 bg-primary/20 text-primary-glow border-primary/40 hover:bg-primary/30 text-xs font-bold rounded-xl gap-2"
                    onClick={() => handleExportPDF(ronda)}
                    disabled={isExporting}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Relatório PDF
                  </Button>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
