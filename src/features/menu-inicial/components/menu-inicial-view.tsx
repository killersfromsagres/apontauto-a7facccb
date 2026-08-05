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
  LayoutDashboard
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
  Cell
} from "recharts";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { fetchGestaoOverview, fetchOsConsolidada } from "@/features/gestao/queries";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

const CORES = ["#4F8CFF", "#52E5FF", "#8B5CF6", "#34d399", "#f59e0b", "#f87171"];

export function MenuInicialView() {
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserName(data.user?.email?.split("@")[0] || "Gestor");
    });
  }, []);

  const { data: overview, isLoading } = useQuery({
    queryKey: ["menu-inicial", "overview"],
    queryFn: () => fetchGestaoOverview(30),
    refetchInterval: 30000, // Atualização a cada 30s para "tempo real"
  });

  const { data: recentEvents } = useQuery({
    queryKey: ["menu-inicial", "recent-events"],
    queryFn: () => fetchOsConsolidada({ dias: 7, modulo: null, equipe: null, predio: null, status: null, criticidade: null }),
    select: (data) => data.slice(0, 5),
    refetchInterval: 60000,
  });

  const chartData = overview?.os_mensal?.map(item => ({
    name: item.mes,
    value: item.criadas
  })) || [];

  const statusData = overview?.os_status 
    ? Object.entries(overview.os_status)
        .map(([name, value]) => ({ 
          name: name.charAt(0).toUpperCase() + name.slice(1), 
          value: Number(value) 
        }))
        .sort((a, b) => b.value - a.value)
    : [];

  const tmaGlobal = overview?.os.tma_horas || 0;
  const mttrGlobal = overview?.os.mttr_horas || 0;

  return (
    <PageShell
      title="Menu Inicial"
      eyebrow="Monitoramento em Tempo Real"
      description={`Olá, ${userName}. Acompanhe o status da operação agora.`}
    >
      <div className="space-y-6">
        {/* GRID DE KPIS COM EFEITO GLOW */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiMonitorCard
            title="SLA GLOBAL"
            value={overview ? `${Math.round((overview.os.sla_ok / (overview.os.concluidas || 1)) * 100)}%` : "0%"}
            trend="+7.36%"
            icon={<Zap className="h-5 w-5 text-primary-glow" />}
            chartColor="#4F8CFF"
            className="glass-block"
          />
          <KpiMonitorCard
            title="CHAMADOS ABERTOS"
            value={overview?.os.abertas.toString() || "0"}
            trend="-12%"
            icon={<Activity className="h-5 w-5 text-[#52E5FF]" />}
            chartColor="#52E5FF"
            className="glass-block"
          />
          <KpiMonitorCard
            title="TOTAL CONCLUÍDOS"
            value={overview?.os.concluidas.toString() || "0"}
            trend="+15%"
            icon={<TrendingUp className="h-5 w-5 text-[#34d399]" />}
            chartColor="#34d399"
            className="glass-block"
          />
          <KpiMonitorCard
            title="MTTR MÉDIO"
            value={`${mttrGlobal.toFixed(1)}h`}
            trend="-5.4%"
            icon={<BarChart3 className="h-5 w-5 text-[#8B5CF6]" />}
            chartColor="#8B5CF6"
            className="glass-block"
          />
        </div>

        {/* MONITORAMENTO PRINCIPAL */}
        <div className="grid gap-6 lg:grid-cols-3">
          <GlassCard className="relative overflow-hidden lg:col-span-2 min-h-[400px] glass-surface card-sheen">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-sm font-semibold tracking-wider text-muted-foreground">VOLUME DE CHAMADOS (MENSAL)</h3>
                <div className="text-2xl font-bold text-white">{overview?.os.criadas || 0} Criados</div>
              </div>
              <div className="flex gap-2">
                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full border border-primary/20">Real Time</span>
              </div>
            </div>
            
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4F8CFF" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#4F8CFF" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "rgba(13, 20, 34, 0.9)", 
                      borderColor: "rgba(255, 255, 255, 0.1)",
                      borderRadius: "12px",
                      backdropFilter: "blur(12px)"
                    }}
                    itemStyle={{ color: "#fff" }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#4F8CFF" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorValue)" 
                    dot={{ r: 4, fill: "#52E5FF", strokeWidth: 2, stroke: "#05070C" }}
                    activeDot={{ r: 6, fill: "#fff" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

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

        {/* ÚLTIMOS EVENTOS / LOGS */}
        <GlassCard className="glass-surface">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold tracking-wider text-muted-foreground">ATIVIDADE DO SISTEMA</h3>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="space-y-4">
            {recentEvents && recentEvents.length > 0 ? (
              recentEvents.map((os) => (
                <div key={os.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Zap className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">OS #{os.numero_os || os.id.slice(0, 8)}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">
                        {os.descricao?.slice(0, 40)}... · {os.criado_em ? formatDistanceToNow(new Date(os.criado_em), { addSuffix: true, locale: ptBR }) : 'Recentemente'}
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma atividade recente encontrada.</p>
            )}
          </div>
        </GlassCard>
      </div>
    </PageShell>
  );
}

function KpiMonitorCard({ title, value, trend, icon, chartColor }: { 
  title: string; 
  value: string; 
  trend: string; 
  icon: React.ReactNode;
  chartColor: string;
}) {
  return (
    <GlassCard className="relative overflow-hidden group hover:border-primary/50 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">{title}</span>
        {icon}
      </div>
      <div className="text-3xl font-bold mb-1 tabular-nums">{value}</div>
      <div className="flex items-center gap-1.5">
        <span className={`text-[11px] font-semibold ${trend.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>
          {trend}
        </span>
        <span className="text-[10px] text-muted-foreground">vs último mês</span>
      </div>
      
      {/* Mini sparkline fake effect */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
        <div 
          className="h-full transition-all duration-1000" 
          style={{ 
            width: '65%', 
            backgroundColor: chartColor,
            boxShadow: `0 0 10px ${chartColor}`
          }} 
        />
      </div>
    </GlassCard>
  );
}
