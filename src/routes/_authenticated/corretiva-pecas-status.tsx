import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Package,
  RefreshCw,
  Search,
  FileSpreadsheet,
  BrainCircuit,
  Loader2,
  Filter,
  ArrowUpDown,
  History,
  LayoutGrid,
  List,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { processarDescricaoPecaIA } from "@/lib/materiais/ia.functions";
import { exportComprasPremiumExcel } from "@/lib/materiais/compras-premium-excel";

export const Route = createFileRoute("/_authenticated/corretiva-pecas-status")({
  component: CentralMateriaisUnificadaPage,
  head: () => ({
    meta: [
      { title: "Central Unificada de Materiais · Apont Auto" },
      { property: "og:title", content: "Central Unificada de Materiais" },
    ],
  }),
});

function CentralMateriaisUnificadaPage() {
  const { isAdmin } = useIsAdmin();
  const [pecas, setPecas] = useState<any[]>([]);
  const [osById, setOsById] = useState<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fOrigem, setFOrigem] = useState<"todas" | "refrigeracao" | "corretiva">("todas");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  
  const processIA = useServerFn(processarDescricaoPecaIA);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rRes, cRes] = await Promise.all([
        supabase.from("refrigeracao_pecas").select("*").order("created_at", { ascending: false }),
        supabase.from("corretiva_pecas").select("*").order("created_at", { ascending: false }),
      ]);

      const rData = (rRes.data || []).map(p => ({ ...p, origem: "refrigeracao" }));
      const cData = (cRes.data || []).map(p => ({ ...p, origem: "corretiva" }));
      const all = [...rData, ...cData].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setPecas(all);

      const rIds = Array.from(new Set(rData.map(p => p.os_id)));
      const cIds = Array.from(new Set(cData.map(p => p.os_id)));

      const [rOs, cOs] = await Promise.all([
        rIds.length ? supabase.from("refrigeracao_os").select("*").in("id", rIds) : { data: [] },
        cIds.length ? supabase.from("corretiva_os").select("*").in("id", cIds) : { data: [] },
      ]);

      const m = new Map();
      (rOs.data || []).forEach(o => m.set(o.id, { ...o, origem: "refrigeracao" }));
      (cOs.data || []).forEach(o => m.set(o.id, { ...o, origem: "corretiva" }));
      setOsById(m);
    } catch (err: any) {
      toast.error("Erro ao carregar materiais: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return pecas.filter(p => {
      if (fOrigem !== "todas" && p.origem !== fOrigem) return false;
      const os = osById.get(p.os_id);
      return (
        !q ||
        p.descricao?.toLowerCase().includes(q) ||
        os?.numero_os?.toLowerCase().includes(q) ||
        os?.nome_os?.toLowerCase().includes(q) ||
        os?.predio?.toLowerCase().includes(q)
      );
    });
  }, [pecas, search, fOrigem, osById]);

  const exportExcel = async () => {
    const toastId = toast.loading("Preparando planilha premium de compras...");
    try {
      await exportComprasPremiumExcel(filtered, osById);
      toast.success("Planilha premium de compras exportada!", { id: toastId });
    } catch (error) {
      console.error("Erro ao exportar compras:", error);
      toast.error("Não foi possível gerar a planilha de compras.", { id: toastId });
    }
  };

  return (
    <PageShell
      title="Central Unificada de Materiais"
      description="Visão consolidada de todas as peças solicitadas em Refrigeração e Corretiva."
      actions={
        <div className="flex gap-2">
          <Button variant="glass" size="sm" onClick={exportExcel} disabled={loading || !filtered.length}>
            <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-500" />
            Exportar compras
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <GlassCard className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por peça, OS, prédio..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-11"
              />
            </div>
            <div className="flex gap-2">
              <Button 
                variant={fOrigem === 'todas' ? 'secondary' : 'glass'} 
                onClick={() => setFOrigem('todas')}
                size="sm"
              >Todas</Button>
              <Button 
                variant={fOrigem === 'refrigeracao' ? 'secondary' : 'glass'} 
                onClick={() => setFOrigem('refrigeracao')}
                size="sm"
              >Refrigeração</Button>
              <Button 
                variant={fOrigem === 'corretiva' ? 'secondary' : 'glass'} 
                onClick={() => setFOrigem('corretiva')}
                size="sm"
              >Corretiva</Button>
            </div>
          </div>
        </GlassCard>

        {/* Agente IA de Processamento Visual/Texto */}
        <GlassCard className="p-6 border-primary/20 bg-primary/5 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <BrainCircuit className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Agente IA de Processamento</h3>
              <p className="text-xs text-muted-foreground">O agente analisa as descrições e separa itens/quantidades automaticamente.</p>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <Input 
                id="ia-input"
                placeholder="Ex: 5 lampadas led, 2 motores weg, 10m cabo 2.5mm" 
                className="h-12 bg-white/5 border-white/10"
              />
            </div>
            <Button 
              className="h-12 px-8 gap-2 premium shadow-lg"
              onClick={async () => {
                const input = document.getElementById('ia-input') as HTMLInputElement;
                if (!input.value) return toast.error("Digite algo para a IA analisar");
                
                const toastId = toast.loading("Agente IA processando...");
                try {
                  const { items } = await processIA({ data: { descricao: input.value } });
                  toast.success(`IA extraiu ${items.length} itens com sucesso!`, { id: toastId });
                  console.log("[IA Results]", items);
                  input.value = "";
                  // Simula a adição ao histórico local para visualização (ou recarrega se salvar no DB)
                  await loadData();
                } catch (e) {
                  toast.error("Erro no processamento da IA", { id: toastId });
                }
              }}
            >
              <BrainCircuit className="h-4 w-4" />
              Processar Descrição
            </Button>
          </div>
          
          <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/5">
            <p className="text-[10px] uppercase font-bold text-primary/70 mb-2">Exemplos que eu entendo:</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-[9px] opacity-70 cursor-pointer hover:opacity-100" onClick={() => (document.getElementById('ia-input') as HTMLInputElement).value = "10 lampadas, 2 reatores"}>"10 lampadas, 2 reatores"</Badge>
              <Badge variant="outline" className="text-[9px] opacity-70 cursor-pointer hover:opacity-100" onClick={() => (document.getElementById('ia-input') as HTMLInputElement).value = "Motor WEG x 1, Correia A32 x 4"}>"Motor WEG x 1, Correia A32 x 4"</Badge>
              <Badge variant="outline" className="text-[9px] opacity-70 cursor-pointer hover:opacity-100" onClick={() => (document.getElementById('ia-input') as HTMLInputElement).value = "Parafuso (20 unidades)"}>"Parafuso (20 unidades)"</Badge>
            </div>
          </div>
        </GlassCard>

        {loading ? (
          <div className="py-20 text-center"><Loader2 className="animate-spin h-10 w-10 mx-auto text-primary" /></div>
        ) : (
          <div className="space-y-3">
            {filtered.map(p => {
              const os = osById.get(p.os_id);
              return (
                <GlassCard key={`${p.origem}-${p.id}`} className="p-4 hover:bg-white/5 transition-all">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className={cn(
                          "text-[10px] font-bold uppercase",
                          p.origem === 'refrigeracao' ? "border-sky-500/50 text-sky-400" : "border-orange-500/50 text-orange-400"
                        )}>
                          {p.origem === 'refrigeracao' ? 'Refrigeração' : 'Corretiva'}
                        </Badge>
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          OS {os?.numero_os || '—'}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(p.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="flex items-start gap-3">
                        <Package className="h-5 w-5 mt-0.5 text-primary/70 shrink-0" />
                        <div>
                          <p className="font-bold text-lg leading-tight">{p.descricao}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {os?.predio} · {os?.andar} · {os?.local}
                          </p>
                          <p className="text-[11px] text-primary/60 font-medium italic mt-0.5">
                            Solicitante: {os?.solicitante || 'Não informado'}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 bg-white/5 p-3 rounded-2xl border border-white/5">
                      <div className="text-center px-4 border-r border-white/10">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Qtd</p>
                        <p className="text-2xl font-black text-white">{p.quantidade || 1}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Equipe</p>
                        <p className="font-bold text-white whitespace-nowrap">{os?.equipe || '—'}</p>
                        <Badge variant="outline" className="mt-1 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px]">
                          IA: Identificado
                        </Badge>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
