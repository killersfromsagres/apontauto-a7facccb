import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Database, Loader2, Info, ArrowLeft, History, RefreshCw } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { recuperarHistoricoRefrigeracao } from "@/lib/refrigeracao/recovery.functions";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";


export const Route = createFileRoute("/_authenticated/refrigeracao-historico-permanente")({
  component: HistoricoPermanentePage,
});

type HistoricoPermanente = {
  ativo: string;
  equipamento: string;
  patrimonio: string | null;
  informacoes_tecnicas: string | null;
  data_ultima_atualizacao: string;
};

function HistoricoPermanentePage() {
  const [search, setSearch] = useState("");
  const [recovering, setRecovering] = useState(false);
  const queryClient = useQueryClient();
  const recover = useServerFn(recuperarHistoricoRefrigeracao);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["refrig-historico-permanente"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("refrigeracao_historico_permanente")
        .select("*")
        .order("data_ultima_atualizacao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HistoricoPermanente[];
    },
  });

  const handleRecover = async () => {
    setRecovering(true);
    try {
      const res = await recover();
      toast.success(`${res.recovered} equipamentos recuperados das OS concluídas.`);
      queryClient.invalidateQueries({ queryKey: ["refrig-historico-permanente"] });
    } catch (e: any) {
      toast.error("Erro ao recuperar histórico: " + e.message);
    } finally {
      setRecovering(false);
    }
  };


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((h) =>
      [h.ativo, h.equipamento, h.patrimonio, h.informacoes_tecnicas]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q))
    );
  }, [rows, search]);

  return (
    <PageShell
      title="Histórico Permanente"
      description="Base de conhecimento técnica por equipamento (BTUs, Modelo, Histórico)."
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRecover} 
          disabled={recovering}
          className="border-primary/20 bg-primary/5 hover:bg-primary/10"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${recovering ? "animate-spin" : ""}`} />
          Recuperar de OS Concluídas
        </Button>
      </div>


      <GlassCard className="p-4">
        <div className="mb-4 flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ativo, equipamento, modelo ou informação técnica..."
            className="h-11 text-base"
          />
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
            Carregando base de conhecimento...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Database className="mx-auto mb-2 h-8 w-8 opacity-20" />
            Nenhuma informação técnica permanente encontrada.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((h) => (
              <GlassCard key={`${h.ativo}-${h.equipamento}`} className="flex flex-col border-primary/10 bg-primary/5 p-4 transition-all hover:border-primary/30">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-primary">{h.ativo}</span>
                      {h.patrimonio && (
                        <Badge variant="outline" className="text-[10px]">
                          PAT {h.patrimonio}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
                      {h.equipamento}
                    </div>
                  </div>
                  <History className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                </div>

                <div className="flex-1 rounded-md bg-background/40 p-3 text-sm text-muted-foreground">
                  {h.informacoes_tecnicas ? (
                    <div className="whitespace-pre-wrap italic">
                      "{h.informacoes_tecnicas}"
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs opacity-50">
                      <Info className="h-3 w-3" /> Sem detalhes técnicos
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground/60">
                  <span>Última atualização:</span>
                  <span>{new Date(h.data_ultima_atualizacao).toLocaleDateString("pt-BR")}</span>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </GlassCard>
    </PageShell>
  );
}
