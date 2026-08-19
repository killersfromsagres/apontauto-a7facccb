import { useQuery } from "@tanstack/react-query";
import { 
  Activity, 
  TrendingUp, 
  Clock, 
  Zap,
  BarChart3,
  LayoutDashboard,
  CloudRain,
  AlertTriangle,
  ClipboardList,
  Filter,
  X,
  Building2,
  Users,
  RefreshCw,
  PieChart as PieChartLucide,
  ShieldCheck
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { fetchGestaoOverview, fetchOsConsolidada } from "@/features/gestao/queries";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, useMemo, lazy, Suspense } from "react";
import { useWeather } from "@/hooks/use-weather";
import { detectRain } from "@/lib/weather/open-meteo";
import { cn } from "@/lib/utils";
import { KpiMonitorCard } from "./kpi-monitor-card";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { PERIODOS, MODULOS, CRITICIDADES } from "@/features/gestao/types";

const AreaChart1 = lazy(() => import("@/components/ui/area-chart-1"));

const CORES = ["#4F8CFF", "#52E5FF", "#8B5CF6", "#34d399", "#f59e0b", "#f87171"];

export function CentralInteligenciaView({ variant }: { variant?: "default" | "chamados" }) {
  const [userName, setUserName] = useState<string | null>(null);
  const [filtros, setFiltros] = useState({
    dias: 30,
    modulo: null as string | null,
    equipe: null as string | null,
    predio: null as string | null,
    status: null as string | null,
    criticidade: null as string | null,
  });

  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserName(user.email?.split("@")[0] || (variant === "chamados" ? "Cliente" : "Gestor"));
      }
    };
    checkUser();
  }, []);

  const { data: overview, isLoading: overviewLoading, error: overviewError, refetch: refetchOverview } = useQuery({
    queryKey: ["gestao", "overview", filtros],
    queryFn: async () => {
      const data = await fetchGestaoOverview(filtros, variant);
      if (!data) throw new Error("O servidor retornou um conjunto de dados vazio.");
      return data;
    },
    refetchInterval: 10000, 
    staleTime: 5000,
    retry: 2,
  });

  const { data: recentEvents } = useQuery({
    queryKey: ["gestao", "os-recente", filtros],
    queryFn: () => fetchOsConsolidada(filtros),
    select: (data) => Array.isArray(data) ? data.slice(0, 10) : [],
    refetchInterval: 5000,
  });

  const chartDataReaviz = useMemo(() => {
    try {
      if (!overview?.os_mensal || !Array.isArray(overview.os_mensal) || overview.os_mensal.length === 0) {
        return [
          { key: 'Chamados IA', data: [{ key: new Date(), data: 0 }] },
          { key: 'Finalizados', data: [{ key: new Date(), data: 0 }] }
        ];
      }
      
      const seriesIA: any = {
        key: 'Chamados IA',
        data: overview.os_mensal.map((item, index) => {
          const d = new Date();
          d.setDate(1);
          d.setMonth(d.getMonth() - (overview.os_mensal!.length - 1 - index));
          return { key: d, data: Math.max(0, Number(item.criadas) || 0) };
        })
      };

      const seriesFinalizados: any = {
        key: 'Finalizados',
        data: overview.os_mensal.map((item, index) => {
          const d = new Date();
          d.setDate(1); 
          d.setMonth(d.getMonth() - (overview.os_mensal!.length - 1 - index));
          return { key: d, data: Math.max(0, Number(item.concluidas) || 0) };
        })
      };

      return [seriesIA, seriesFinalizados];
    } catch (err) {
      console.error("Error computing chartDataReaviz:", err);
      return [];
    }
  }, [overview?.os_mensal]);

  const statusData = overview?.os_status 
    ? Object.entries(overview.os_status)
        .map(([name, value]) => ({ 
          name: name.charAt(0).toUpperCase() + name.slice(1), 
          value: Number(value) 
        }))
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value)
    : [];

  const taludesData = [
    { name: "Ativas", value: overview?.taludes?.pt_ativas || 0, color: "#34d399" },
    { name: "Aguardando", value: overview?.taludes?.pt_aguardando || 0, color: "#f59e0b" },
    { name: "Suspensas", value: overview?.taludes?.pt_suspensas || 0, color: "#f87171" },
  ].filter(d => d.value > 0);

  const tmaGlobal = overview?.os.tma_horas || 0;
  const mttrGlobal = overview?.os.mttr_horas || 0;

  return (
    <PageShell
      title={variant === "chamados" ? "Monitoramento de Chamados" : "Menu Inicial"}
      eyebrow={variant === "chamados" ? "Painel do Cliente" : "Operação Premium em Tempo Real"}
      description={variant === "chamados" ? `Olá, ${userName}. Acompanhe o andamento da sua programação.` : `Olá, ${userName}. Sistema operando em modo de alta performance.`}

    >
      <div className="space-y-6">
        {overviewError && (
          <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-500 text-sm backdrop-blur-md animate-in fade-in zoom-in duration-300">
            <h4 className="font-bold flex items-center gap-2 mb-2 text-lg">
              <AlertTriangle className="h-5 w-5" /> Erro ao carregar a página
            </h4>
            <div className="space-y-2 opacity-90 mb-4">
              <p>Algo deu errado. Tente recarregar ou voltar ao dashboard.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" size="sm" className="bg-rose-500/20 text-rose-500" onClick={() => refetchOverview()}>
                <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
              </Button>
              <Button variant="ghost" size="sm" className="text-rose-500" onClick={() => window.location.href = '/'}>
                Voltar ao dashboard
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
              <Filter className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-tight">Filtros Operacionais</h2>
              <p className="text-[10px] text-muted-foreground uppercase">Refinar dashboard em tempo real</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={filtros.dias.toString()} onValueChange={(v) => setFiltros(prev => ({ ...prev, dias: parseInt(v) }))}>
              <SelectTrigger className="w-[130px] h-9 bg-white/5 border-white/10 text-xs">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10">
                {PERIODOS.map(p => <SelectItem key={p.dias} value={p.dias.toString()} className="text-xs uppercase">{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="h-9 px-3 gap-2 text-xs bg-white/5 border-white/10">
              <Filter className="w-3.5 h-3.5" /> Mais Filtros
            </Button>
          </div>
        </div>

        <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", variant === "chamados" ? "lg:grid-cols-4" : "lg:grid-cols-5")}>
           <KpiMonitorCard title="SLA GLOBAL" value={overview ? `${Math.round((overview.os.sla_ok / (overview.os.concluidas || 1)) * 100)}%` : "0%"} icon={<Zap className="h-5 w-5 text-[#4F8CFF]" />} description="Eficiência de atendimento" />
           <KpiMonitorCard title="BACKORDER" value={overview?.os.backlog.toString() || "0"} icon={<ClipboardList className="h-5 w-5 text-[#52E5FF]" />} description="Chamados em espera" />
           <KpiMonitorCard title="CAMPO IA" value={overview?.corretiva_novo?.criadas.toString() || "0"} icon={<Activity className="h-5 w-5 text-[#8B5CF6]" />} description="Execução Campo IA" />
           {variant !== "chamados" && <KpiMonitorCard title="MTTR" value={`${mttrGlobal.toFixed(1)}h`} icon={<Clock className="h-5 w-5 text-[#34d399]" />} description="Tempo de reparo" />}
           <KpiMonitorCard title="ALERTAS" value={overview?.os.criticas.toString() || "0"} icon={<AlertTriangle className="h-5 w-5 text-rose-500" />} description="Prioridade Alta" />
        </div>


        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <GlassCard className="lg:col-span-3 p-0 overflow-hidden border-primary/20 bg-primary/5 min-h-[620px]">
            <Suspense fallback={
              <div className="flex flex-col items-center justify-center h-[580px] text-muted-foreground animate-pulse">
                <BarChart3 className="h-10 w-10 mb-4 opacity-20" />
                <p className="text-sm font-medium uppercase tracking-widest opacity-50">Sincronizando Inteligência IA...</p>
              </div>
            }>
              <AreaChart1 
                title="Performance Operacional"
                data={chartDataReaviz}
                legendItems={[
                  { name: 'Chamados IA', color: '#8B5CF6' },
                  { name: 'Finalizados', color: '#4F8CFF' }
                ]}
                metrics={[
                  {
                    id: 'tma',
                    Icon: Clock,
                    label: 'Tempo Médio Atendimento',
                    tooltip: 'Média de horas para conclusão',
                    value: `${tmaGlobal.toFixed(1)}h`,
                    TrendIcon: TrendingUp,
                    trendBaseColor: tmaGlobal > 24 ? '#E84045' : '#40E5D1',
                    trendStrokeColor: tmaGlobal > 24 ? '#F08083' : '#40E5D1',
                    delay: 0,
                  },
                  {
                    id: 'mttr',
                    Icon: Activity,
                    label: 'MTTR Médio',
                    tooltip: 'Mean Time To Repair',
                    value: `${mttrGlobal.toFixed(1)}h`,
                    TrendIcon: TrendingUp,
                    trendBaseColor: mttrGlobal > 12 ? '#E84045' : '#40E5D1',
                    trendStrokeColor: mttrGlobal > 12 ? '#F08083' : '#40E5D1',
                    delay: 0.1,
                  },
                  {
                    id: 'sla',
                    Icon: ShieldCheck,
                    label: 'Aderência ao SLA',
                    tooltip: 'Percentual de OS dentro do prazo',
                    value: overview ? `${Math.round((overview.os.sla_ok / (overview.os.concluidas || 1)) * 100)}%` : "0%",
                    TrendIcon: TrendingUp,
                    trendBaseColor: '#40E5D1',
                    trendStrokeColor: '#40E5D1',
                    delay: 0.2,
                  }
                ]}
              />
            </Suspense>
          </GlassCard>
          <div className="lg:col-span-2 space-y-4">
             <GlassCard className="p-6 border-white/5 bg-white/5 h-full">
                <h3 className="text-sm font-bold text-white uppercase tracking-tight mb-6 flex items-center gap-2">
                  <PieChartLucide className="h-4 w-4 text-[#52E5FF]" /> Distribuição por Status
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {statusData.length > 0 ? statusData.slice(0, 6).map((item, idx) => (
                    <div key={item.name} className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CORES[idx % CORES.length] }} />
                        <p className="text-[10px] text-muted-foreground uppercase font-bold truncate">{item.name}</p>
                      </div>
                      <p className="text-lg font-bold text-white">{item.value}</p>
                    </div>
                  )) : (
                    <div className="col-span-2 flex flex-col items-center justify-center py-10 opacity-20">
                      <PieChartLucide className="h-10 w-10 mb-2" />
                      <p className="text-[10px] font-bold uppercase">Sem dados</p>
                    </div>
                  )}
                </div>
             </GlassCard>

             {overview?.taludes && (
               <GlassCard className="p-6 border-white/5 bg-white/5">
                 <h3 className="text-sm font-bold text-white uppercase tracking-tight flex items-center gap-2 mb-6">
                   <CloudRain className="h-4 w-4 text-primary" /> Monitoramento de Taludes
                 </h3>
                 <div className="grid grid-cols-3 gap-3">
                   {taludesData.map((d) => (
                     <div key={d.name} className="text-center p-3 rounded-xl bg-white/5 border border-white/10">
                       <p className="text-[9px] text-muted-foreground uppercase font-bold mb-1">{d.name}</p>
                       <p className="text-lg font-bold" style={{ color: d.color }}>{d.value}</p>
                     </div>
                   ))}
                 </div>
               </GlassCard>
             )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <GlassCard className="lg:col-span-3 p-6 border-white/5 bg-white/5 overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold text-white uppercase tracking-tight flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-primary animate-spin-slow" /> Atividade Recente (IA Triage)
              </h3>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-emerald-500 font-bold uppercase">Sincronizado</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] text-muted-foreground uppercase font-black tracking-widest border-b border-white/5">
                    <th className="pb-3 px-2">Data/Hora</th>
                    <th className="pb-3 px-2">Ativo</th>
                    <th className="pb-3 px-2">Solicitação</th>
                    <th className="pb-3 px-2">Equipe</th>
                    <th className="pb-3 px-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {recentEvents?.map((os: any) => (
                    <tr key={os.id} className="group hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 px-2">
                        <span className="text-[10px] font-mono text-white/70">
                          {os.data_criacao ? new Date(os.data_criacao).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : "N/A"}
                        </span>
                      </td>
                      <td className="py-4 px-2">
                        <span className="text-[11px] font-bold text-white">#{os.id.slice(0, 8)}</span>
                      </td>
                      <td className="py-4 px-2 max-w-xs">
                        <span className="text-[11px] text-white/90 line-clamp-1 group-hover:line-clamp-none transition-all">
                          {os.descricao || "Sem descrição"}
                        </span>
                      </td>
                      <td className="py-4 px-2">
                        <span className="text-[9px] font-bold text-white uppercase px-2 py-1 rounded-full bg-white/5 border border-white/10">
                          {os.equipe || "IA Triage"}
                        </span>
                      </td>
                      <td className="py-4 px-2">
                        <div className={cn(
                          "px-2 py-1 rounded-full text-[9px] font-black uppercase text-center border w-fit",
                          os.status === "concluido" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                          os.status === "em_andamento" ? "bg-primary/10 text-primary border-primary/20" :
                          "bg-amber-500/10 text-amber-500 border-amber-500/20"
                        )}>
                          {os.status || "Pendente"}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      </div>
    </PageShell>
  );
}