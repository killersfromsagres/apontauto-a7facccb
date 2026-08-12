import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Activity, 
  TrendingUp, 
  Clock, 
  ArrowUpRight, 
  Zap,
  BarChart3,
  PieChart as PieChartIcon,
  LayoutDashboard,
  CloudSun,
  CloudRain,
  Thermometer,
  Wind,
  Cloud,
  AlertTriangle,
  ClipboardList,
  Wrench,
  Droplets,
  PackageOpen,
  Fuel,
  ShieldCheck,
  Package,
  Boxes,
  Filter,
  X,
  Building2,
  Users,
  RefreshCw
} from "lucide-react";
import { 
  Area, 
  AreaChart, 
  ResponsiveContainer, 
  Tooltip, 
  XAxis, 
  YAxis,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart
} from "recharts";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { fetchGestaoOverview, fetchOsConsolidada } from "@/features/gestao/queries";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, useMemo, lazy, Suspense } from "react";
import { useWeather } from "@/hooks/use-weather";
import { detectRain } from "@/lib/weather/open-meteo";
import { cn } from "@/lib/utils";
import { KpiMonitorCard } from "./kpi-monitor-card";

// Lazy load the new area chart to avoid SSR issues with reaviz
const AreaChart1 = lazy(() => import("@/components/ui/area-chart-1"));

import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { PERIODOS, MODULOS, CRITICIDADES } from "@/features/gestao/types";

const CORES = ["#4F8CFF", "#52E5FF", "#8B5CF6", "#34d399", "#f59e0b", "#f87171"];


export function CentralInteligenciaView() {
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
    supabase.auth.getUser().then(({ data }) => {
      setUserName(data.user?.email?.split("@")[0] || "Gestor");
    });
  }, []);

  const { data: overview, isLoading: overviewLoading, error: overviewError } = useQuery({
    queryKey: ["gestao", "overview", filtros],
    queryFn: async () => {
      try {
        const data = await fetchGestaoOverview(filtros);
        console.log("Dashboard data fetched successfully:", data);
        return data;
      } catch (err) {
        console.error("Dashboard fetch error:", err);
        throw err;
      }
    },
    refetchInterval: 10000, 
    staleTime: 5000,
  });

  const { data: weather, isLoading: weatherLoading } = useWeather();
  const weatherStatus = weather ? detectRain(weather) : null;

  const { data: recentEvents } = useQuery({
    queryKey: ["gestao", "os-recente", filtros],
    queryFn: () => fetchOsConsolidada(filtros),
    select: (data) => data.slice(0, 10),
    refetchInterval: 5000,
    staleTime: 0,
    gcTime: 0,
  });


  const chartDataReaviz = useMemo(() => {
    if (!overview?.os_mensal) return [];
    
    // Mapping for AreaChart1 (reaviz)
    const seriesIA: any = {
      key: 'Chamados IA',
      data: overview.os_mensal.map((item, index) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (overview.os_mensal!.length - 1 - index));
        return {
          key: d,
          data: item.criadas || 0
        };
      })
    };

    const seriesFinalizados: any = {
      key: 'Finalizados',
      data: overview.os_mensal.map((item, index) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (overview.os_mensal!.length - 1 - index));
        return {
          key: d,
          data: item.concluidas || 0
        };
      })
    };

    return [seriesIA, seriesFinalizados];
  }, [overview?.os_mensal]);

  // chartData original removido para favorecer chartDataReaviz


  const statusData = overview?.os_status 
    ? Object.entries(overview.os_status)
        .map(([name, value]) => ({ 
          name: name.charAt(0).toUpperCase() + name.slice(1), 
          value: Number(value) 
        }))
        .filter(item => item.value > 0) // Remove status zerados para limpar o gráfico
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
      title="Menu Inicial"
      eyebrow="Operação Premium em Tempo Real"
      description={`Olá, ${userName}. Sistema operando em modo de alta performance.`}
    >
      <div className="space-y-6">
        {overviewError && (
          <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-500 text-sm backdrop-blur-md">
            <h4 className="font-bold flex items-center gap-2 mb-2 text-lg">
              <AlertTriangle className="h-5 w-5" /> Erro ao carregar dashboard
            </h4>
            <p className="opacity-90 mb-4">{(overviewError as Error).message}. Verifique as permissões ou tente atualizar a página.</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="bg-rose-500/20 border-rose-500/30 hover:bg-rose-500/30 text-rose-500"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Recarregar Página
            </Button>
          </div>
        )}

        {/* BARRA DE FILTROS GLOBAIS */}
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
            <Select 
              value={filtros.dias.toString()} 
              onValueChange={(v) => setFiltros(prev => ({ ...prev, dias: parseInt(v) }))}
            >
              <SelectTrigger className="w-[130px] h-9 bg-white/5 border-white/10 text-xs">
                <Clock className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10">
                {PERIODOS.map(p => (
                  <SelectItem key={p.dias} value={p.dias.toString()} className="text-xs uppercase">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select 
              value={filtros.modulo || "todos"} 
              onValueChange={(v) => setFiltros(prev => ({ ...prev, modulo: v === "todos" ? null : v }))}
            >
              <SelectTrigger className="w-[130px] h-9 bg-white/5 border-white/10 text-xs">
                <LayoutDashboard className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Módulo" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10">
                <SelectItem value="todos" className="text-xs uppercase">Todos Módulos</SelectItem>
                {MODULOS.map(m => (
                  <SelectItem key={m} value={m} className="text-xs uppercase">
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "h-9 px-3 gap-2 text-xs border-white/10 transition-all",
                showFilters ? "bg-primary/20 border-primary/30 text-primary" : "bg-white/5"
              )}
            >
              {showFilters ? <X className="w-3.5 h-3.5" /> : <Filter className="w-3.5 h-3.5" />}
              {showFilters ? "Fechar Filtros" : "Mais Filtros"}
            </Button>

            {(filtros.equipe || filtros.predio || filtros.criticidade) && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setFiltros({
                  dias: 30,
                  modulo: null,
                  equipe: null,
                  predio: null,
                  status: null,
                  criticidade: null
                })}
                className="h-9 px-3 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
              >
                Limpar
              </Button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-white/5 rounded-2xl border border-white/10 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase px-1 flex items-center gap-1.5">
                <Users className="w-3 h-3" /> Equipe Responsável
              </label>
              <Select 
                value={filtros.equipe || "todas"} 
                onValueChange={(v) => setFiltros(prev => ({ ...prev, equipe: v === "todas" ? null : v }))}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-xs h-9">
                  <SelectValue placeholder="Selecione a equipe" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/10">
                  <SelectItem value="todas" className="text-xs uppercase">Todas Equipes</SelectItem>
                  {/* Hardcoded options as fallback for common teams in this project */}
                  <SelectItem value="Hidráulica" className="text-xs uppercase">Hidráulica</SelectItem>
                  <SelectItem value="Civil" className="text-xs uppercase">Civil</SelectItem>
                  <SelectItem value="Elétrica" className="text-xs uppercase">Elétrica</SelectItem>
                  <SelectItem value="Refrigeração" className="text-xs uppercase">Refrigeração</SelectItem>
                  <SelectItem value="Pintura" className="text-xs uppercase">Pintura</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase px-1 flex items-center gap-1.5">
                <Building2 className="w-3 h-3" /> Prédio / Localidade
              </label>
              <Select 
                value={filtros.predio || "todos"} 
                onValueChange={(v) => setFiltros(prev => ({ ...prev, predio: v === "todos" ? null : v }))}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-xs h-9">
                  <SelectValue placeholder="Selecione o prédio" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/10">
                  <SelectItem value="todos" className="text-xs uppercase">Todos Prédios</SelectItem>
                  <SelectItem value="A" className="text-xs uppercase">Prédio A</SelectItem>
                  <SelectItem value="B" className="text-xs uppercase">Prédio B</SelectItem>
                  <SelectItem value="C" className="text-xs uppercase">Prédio C</SelectItem>
                  <SelectItem value="D" className="text-xs uppercase">Prédio D</SelectItem>
                  <SelectItem value="Administrativo" className="text-xs uppercase">Administrativo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase px-1 flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3" /> Nível de Criticidade
              </label>
              <Select 
                value={filtros.criticidade || "todas"} 
                onValueChange={(v) => setFiltros(prev => ({ ...prev, criticidade: v === "todas" ? null : v }))}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-xs h-9">
                  <SelectValue placeholder="Selecione a criticidade" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/10">
                  <SelectItem value="todas" className="text-xs uppercase">Todas Criticidades</SelectItem>
                  {CRITICIDADES.map(c => (
                    <SelectItem key={c} value={c} className="text-xs uppercase">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* LINHA 1: KPIs OPERACIONAIS CRÍTICOS */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiMonitorCard
            title="SLA GLOBAL"
            value={overview ? `${Math.round((overview.os.sla_ok / (overview.os.concluidas || 1)) * 100)}%` : "0%"}
            trend="+2.4%"
            icon={<Zap className="h-5 w-5 text-[#4F8CFF] drop-shadow-[0_0_8px_rgba(79,140,255,0.5)]" />}
            chartColor="#4F8CFF"
            description="Eficiência de atendimento"
          />
          <KpiMonitorCard
            title="BACKORDER ATIVO"
            value={overview?.os.backlog.toString() || "0"}
            trend="+5.2%"
            icon={<ClipboardList className="h-5 w-5 text-[#52E5FF]" />}
            chartColor="#52E5FF"
            description="Chamados em espera"
          />
          <KpiMonitorCard
            title="CAMPO IA (MÊS)"
            value={overview?.corretiva_novo?.criadas.toString() || "0"}
            trend={(() => {
              const atual = overview?.corretiva_novo?.criadas || 0;
              const ant = overview?.corretiva_novo?.criadas_ant || 0;
              if (ant === 0) return "+0%";
              const pct = ((atual - ant) / ant) * 100;
              return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
            })()}
            icon={<Activity className="h-5 w-5 text-[#8B5CF6]" />}
            chartColor="#8B5CF6"
            description="Total Execução Campo IA"
          />
          <KpiMonitorCard
            title="MTTR MÉDIO"
            value={`${mttrGlobal.toFixed(1)}h`}
            trend="-12%"
            icon={<Clock className="h-5 w-5 text-[#34d399]" />}
            chartColor="#34d399"
            description="Tempo médio de reparo"
          />
          <KpiMonitorCard
            title="CRITICAL ALERT"
            value={overview?.os.criticas.toString() || "0"}
            trend="+0"
            icon={<AlertTriangle className={cn("h-5 w-5", (overview?.os.criticas || 0) > 0 ? "text-rose-500 animate-pulse" : "text-muted-foreground")} />}
            chartColor="#f87171"
            description="OS de alta prioridade"
          />
        </div>

        {/* LINHA 2: GESTÃO DE RECURSOS E MATERIAIS */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiMonitorCard
            title="PEÇAS PENDENTES"
            value={overview?.pecas.aguardando.toString() || "0"}
            icon={<PackageOpen className="h-5 w-5 text-amber-400" />}
            chartColor="#fbbf24"
            description="Aguardando suprimentos"
          />
          <KpiMonitorCard
            title="SOLICITAÇÕES MATERIAIS"
            value={overview?.materiais.pendentes.toString() || "0"}
            icon={<Boxes className="h-5 w-5 text-blue-400" />}
            chartColor="#60a5fa"
            description="Pedidos em aberto"
          />
          <KpiMonitorCard
            title="FILTROS VENCIDOS"
            value={overview?.filtros.vencidos.toString() || "0"}
            icon={<Droplets className="h-5 w-5 text-rose-400" />}
            chartColor="#f87171"
            description="Trocas obrigatórias"
          />
          <KpiMonitorCard
            title="ITENS LEGAIS"
            value={overview?.legal.vencidos.toString() || "0"}
            icon={<ShieldCheck className="h-5 w-5 text-emerald-400" />}
            chartColor="#34d399"
            description="Conformidade e normas"
          />
          <KpiMonitorCard
            title="DISP. FROTA"
            value={overview ? `${Math.round((overview.frota.disponiveis / (overview.frota.total || 1)) * 100)}%` : "0%"}
            icon={<Fuel className="h-5 w-5 text-indigo-400" />}
            chartColor="#818cf8"
            description="Veículos operacionais"
          />
        </div>

        {/* MONITORAMENTO PRINCIPAL */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="relative overflow-hidden lg:col-span-2 min-h-[400px]">
            <div className="hidden">
              <div>
                <h3 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Volume de Campo IA & Histórico</h3>
                <div className="text-2xl font-bold text-white">
                  {overview?.corretiva_novo?.criadas || 0} Criados este mês
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full border border-primary/20 mb-1">
                  Módulo Corretiva
                </span>
                <span className="text-[10px] text-muted-foreground uppercase">
                  {overview?.corretiva_novo?.concluidas || 0} Finalizados
                </span>
              </div>
            </div>
            
            <div className="h-[580px] w-full">
              <Suspense fallback={<div className="h-full w-full flex items-center justify-center text-muted-foreground">Carregando gráficos premium...</div>}>
                <AreaChart1 
                  title=""
                  data={chartDataReaviz}
                  legendItems={[
                    { name: 'Chamados IA', color: '#8B5CF6' },
                    { name: 'Finalizados', color: '#34d399' }
                  ]}
                  metrics={[
                    {
                      id: 'mttd',
                      Icon: Clock,
                      label: 'Tempo Médio Resposta',
                      tooltip: 'Tempo Médio Resposta',
                      value: `${mttrGlobal.toFixed(1)}h`,
                      TrendIcon: TrendingUp,
                      trendBaseColor: '#34d399',
                      trendStrokeColor: '#34d399',
                      delay: 0,
                    },
                    {
                      id: 'sla',
                      Icon: Zap,
                      label: 'Eficiência SLA',
                      tooltip: 'Eficiência SLA',
                      value: overview ? `${Math.round((overview.os.sla_ok / (overview.os.concluidas || 1)) * 100)}%` : "0%",
                      TrendIcon: TrendingUp,
                      trendBaseColor: '#4F8CFF',
                      trendStrokeColor: '#4F8CFF',
                      delay: 0.05,
                    }
                  ]}
                />
              </Suspense>
            </div>
          </div>


          <GlassCard className="flex flex-col glass-surface card-sheen">
            <h3 className="text-sm font-semibold tracking-wider text-muted-foreground mb-6">DISTRIBUIÇÃO POR STATUS</h3>
            <div className="flex-1 flex items-center justify-center">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={statusData}>
                  <XAxis dataKey="name" hide />
                  <Tooltip 
                     contentStyle={{ 
                      backgroundColor: "rgba(13, 20, 34, 0.9)", 
                      borderColor: "rgba(255, 255, 255, 0.1)",
                      borderRadius: "12px",
                      backdropFilter: "blur(12px)"
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CORES[index % CORES.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-6 space-y-3">
              {statusData.slice(0, 4).map((item, i) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CORES[i % CORES.length] }} />
                    <span className="text-xs text-muted-foreground uppercase">{item.name}</span>
                  </div>
                  <span className="text-sm font-semibold">{item.value}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        {/* ÚLTIMOS EVENTOS E MONITORAMENTO DE TALUDES */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* ÚLTIMOS EVENTOS / LOGS */}
          <GlassCard className="glass-surface">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Atividade do Sistema</h3>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-4">
              {recentEvents && recentEvents.length > 0 ? (
                recentEvents.map((os) => (
                  <div key={os.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center",
                        os.origem === 'corretiva_novo' ? "bg-purple-500/10" : "bg-primary/10"
                      )}>
                        {os.origem === 'corretiva_novo' ? (
                          <Activity className="h-4 w-4 text-purple-400" />
                        ) : (
                          <Zap className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">OS #{os.numero_os || os.id.slice(0, 8)}</p>
                          {os.status_canonico === 'concluida' && (
                            <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 rounded uppercase font-bold">OK</span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground uppercase truncate">
                          {os.equipe} · {os.descricao?.slice(0, 30)}... · {os.criado_em ? formatDistanceToNow(new Date(os.criado_em), { addSuffix: true, locale: ptBR }) : 'Recentemente'}
                        </p>
                      </div>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhuma atividade recente encontrada.</p>
              )}
            </div>
          </GlassCard>

          {/* MONITORAMENTO DE TALUDES E CLIMA */}
          <GlassCard className="glass-surface relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Status Taludes & Clima</h3>
              {weatherStatus?.detected ? (
                <CloudRain className="h-4 w-4 text-rose-400 animate-pulse" />
              ) : weatherStatus?.label?.toLowerCase().includes("nublado") ? (
                <Cloud className="h-4 w-4 text-blue-300" />
              ) : (
                <CloudSun className="h-4 w-4 text-emerald-400" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className={cn(
                  "p-3 rounded-xl border transition-colors",
                  weatherStatus?.detected 
                    ? "bg-rose-500/10 border-rose-500/20 text-rose-400" 
                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                )}>
                  <div className="flex items-center gap-2 mb-1">
                    <Thermometer className="h-4 w-4" />
                    <span className="text-xl font-bold">{weather ? Math.round(weather.current.temperature_2m) : "--"}°C</span>
                  </div>
                  <p className="text-[10px] font-medium uppercase tracking-wider">
                    {weatherStatus?.label || "Carregando..."}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/5 p-2 rounded-lg border border-white/10">
                    <span className="text-[9px] text-muted-foreground block uppercase">Vento</span>
                    <span className="text-xs font-semibold">{weather ? Math.round(weather.current.wind_speed_10m) : "--"} km/h</span>
                  </div>
                  <div className="bg-white/5 p-2 rounded-lg border border-white/10">
                    <span className="text-[9px] text-muted-foreground block uppercase">Humidade</span>
                    <span className="text-xs font-semibold">{weather ? Math.round(weather.current.relative_humidity_2m) : "--"}%</span>
                  </div>
                </div>
              </div>

              <div className="relative h-[120px]">
                {taludesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={taludesData}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={50}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {taludesData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "rgba(13, 20, 34, 0.9)", 
                          borderColor: "rgba(255, 255, 255, 0.1)",
                          borderRadius: "12px",
                          backdropFilter: "blur(12px)",
                          fontSize: "10px"
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-[10px] text-muted-foreground text-center px-4">
                    Nenhuma PT ativa no momento
                  </div>
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-lg font-bold leading-none">
                    {overview?.taludes?.pt_ativas || 0}
                  </span>
                  <span className="text-[8px] text-muted-foreground uppercase">PTs Ativas</span>
                </div>
              </div>
            </div>

            {weatherStatus?.detected && (
              <div className="mt-4 p-2 bg-rose-500/20 border border-rose-500/30 rounded-lg text-rose-400 text-[10px] animate-pulse">
                <strong>ALERTA:</strong> Chuva detectada. Operações em taludes suspensas automaticamente.
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </PageShell>
  );
}

// KpiMonitorCard removido daqui pois agora é importado de ./kpi-monitor-card

