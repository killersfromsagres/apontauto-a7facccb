import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleGauge,
  Clock3,
  Database,
  ListChecks,
  PackageCheck,
  RefreshCw,
  TimerReset,
  Wrench,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { fetchCorretivaDashboard } from "../corretiva-dashboard";

const CorretivaDashboardCharts = lazy(() => import("./corretiva-dashboard-charts"));

const PERIODS = [
  { value: 7, label: "7 dias" },
  { value: 30, label: "30 dias" },
  { value: 90, label: "90 dias" },
  { value: 180, label: "180 dias" },
] as const;

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Sem atualização registrada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAverageDays(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value < 1) return `${Math.max(1, Math.round(value * 24))}h`;
  return `${value.toFixed(value < 10 ? 1 : 0)}d`;
}

function MetricCard({
  label,
  value,
  description,
  icon,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
  tone?: "primary" | "success" | "warning" | "danger" | "violet" | "cyan";
}) {
  const toneClass = {
    primary: "border-primary/20 bg-primary/5 text-primary",
    success: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400",
    warning: "border-amber-500/20 bg-amber-500/5 text-amber-400",
    danger: "border-rose-500/20 bg-rose-500/5 text-rose-400",
    violet: "border-violet-500/20 bg-violet-500/5 text-violet-400",
    cyan: "border-cyan-500/20 bg-cyan-500/5 text-cyan-400",
  }[tone];

  return (
    <GlassCard className="group relative min-h-[138px] overflow-hidden border-white/10 bg-white/[0.035] p-4 transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.055] motion-reduce:transform-none motion-reduce:transition-none">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-foreground">{value}</p>
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", toneClass)}>
          {icon}
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </GlassCard>
  );
}

function ChartsLoading() {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
      <div className="h-[430px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.03] motion-reduce:animate-none xl:col-span-3" />
      <div className="h-[430px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.03] motion-reduce:animate-none xl:col-span-2" />
      <div className="h-[390px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.03] motion-reduce:animate-none xl:col-span-5" />
    </div>
  );
}

export function CentralInteligenciaView({ variant }: { variant?: "default" | "chamados" }) {
  const [userName, setUserName] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [team, setTeam] = useState("todas");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!user) return;
      const displayName =
        user.user_metadata?.nome ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        (variant === "chamados" ? "Cliente" : "Gestor");
      setUserName(String(displayName));
    });
  }, [variant]);

  const selectedTeam = team === "todas" ? null : team;
  const dashboardQuery = useQuery({
    queryKey: ["corretiva-dashboard", days, selectedTeam],
    queryFn: () => fetchCorretivaDashboard({ dias: days, equipe: selectedTeam }),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 2,
  });

  const data = dashboardQuery.data;
  const metrics = data?.metrics;
  const lastUpdate = data?.lastDatabaseUpdate ?? data?.generatedAt;

  const sourceSummary = useMemo(
    () => [
      { label: "Novo", href: "/corretiva-novo" },
      { label: "Execução de Campo", href: "/corretiva" },
      { label: "Histórico de Execução", href: "/corretiva-historico" },
    ],
    [],
  );

  return (
    <PageShell
      title={variant === "chamados" ? "Monitoramento de Corretivas" : "Menu Inicial"}
      eyebrow="Corretivas · operação atual"
      description={
        variant === "chamados"
          ? `Olá, ${userName || "usuário"}. Acompanhe exclusivamente o fluxo atualizado de corretivas.`
          : `Olá, ${userName || "usuário"}. Indicadores consolidados somente das rotinas atualmente usadas pelas equipes.`
      }
    >
      <div className="space-y-5 sm:space-y-6">
        <GlassCard className="border-primary/15 bg-gradient-to-r from-primary/[0.08] via-white/[0.025] to-cyan-500/[0.04] p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-400">
                  <Database className="h-3.5 w-3.5" /> Fonte operacional ativa
                </span>
                <span className="text-xs text-muted-foreground">
                  Última movimentação: <strong className="font-medium text-foreground/90">{formatDateTime(lastUpdate)}</strong>
                </span>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Este painel ignora bases antigas e consolida apenas os registros de Corretivas usados em Novo, Execução de Campo e Histórico de Execução.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sourceSummary.map((source) => (
                  <a
                    key={source.href}
                    href={source.href}
                    className="inline-flex min-h-9 items-center rounded-lg border border-white/10 bg-white/[0.035] px-3 text-xs font-medium text-foreground/80 transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  >
                    {source.label}
                  </a>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:justify-end">
              <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
                <SelectTrigger className="h-11 w-full border-white/10 bg-white/[0.04] sm:w-[145px]">
                  <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((period) => (
                    <SelectItem key={period.value} value={String(period.value)}>
                      {period.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={team} onValueChange={setTeam}>
                <SelectTrigger className="h-11 w-full border-white/10 bg-white/[0.04] sm:w-[210px]">
                  <Wrench className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Todas as equipes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as equipes</SelectItem>
                  {(data?.teamOptions ?? []).map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="outline"
                className="h-11 gap-2 border-white/10 bg-white/[0.04]"
                onClick={() => dashboardQuery.refetch()}
                disabled={dashboardQuery.isFetching}
              >
                <RefreshCw className={cn("h-4 w-4", dashboardQuery.isFetching && "animate-spin motion-reduce:animate-none")} />
                Atualizar
              </Button>
            </div>
          </div>
        </GlassCard>

        {dashboardQuery.isError && (
          <div className="flex flex-col gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] p-4 text-sm text-rose-300 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Não foi possível atualizar os indicadores de corretivas.</p>
                <p className="mt-1 text-xs text-rose-200/70">Os dados anteriores permanecem preservados. Tente atualizar novamente.</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="border-rose-500/25 bg-rose-500/10" onClick={() => dashboardQuery.refetch()}>
              Tentar novamente
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <MetricCard
            label="Em campo"
            value={metrics?.emCampo ?? "—"}
            description="OS corretivas ainda abertas na execução de campo."
            icon={<CircleGauge className="h-5 w-5" />}
            tone="primary"
          />
          <MetricCard
            label="Finalizadas"
            value={metrics?.concluidas ?? "—"}
            description={`Concluídas no Histórico de Execução nos últimos ${days} dias.`}
            icon={<CheckCircle2 className="h-5 w-5" />}
            tone="success"
          />
          <MetricCard
            label="Entradas"
            value={metrics?.entradas ?? "—"}
            description={`Novas corretivas registradas no período selecionado.`}
            icon={<ListChecks className="h-5 w-5" />}
            tone="cyan"
          />
          <MetricCard
            label="Atrasadas 30d+"
            value={metrics?.atrasadas ?? "—"}
            description="OS ainda abertas com 30 dias ou mais desde a criação."
            icon={<AlertTriangle className="h-5 w-5" />}
            tone="danger"
          />
          <MetricCard
            label="SLA 30 dias"
            value={metrics?.slaPercent === null || metrics?.slaPercent === undefined ? "—" : `${metrics.slaPercent}%`}
            description="Percentual das finalizadas no período concluídas em até 30 dias."
            icon={<PackageCheck className="h-5 w-5" />}
            tone="violet"
          />
          <MetricCard
            label="Tempo médio"
            value={formatAverageDays(metrics?.tempoMedioDias)}
            description="Tempo médio entre a abertura e a conclusão das OS finalizadas."
            icon={<TimerReset className="h-5 w-5" />}
            tone="warning"
          />
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="inline-flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-primary" /> {data?.sourceRows ?? 0} registros relevantes no recorte atual
            </span>
            <span className="inline-flex items-center gap-2">
              <PackageCheck className="h-3.5 w-3.5 text-amber-400" /> {metrics?.materiaisSolicitados ?? 0} OS abertas com material sinalizado
            </span>
          </div>
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <Clock3 className="h-3.5 w-3.5" /> atualização automática a cada 30s
          </span>
        </div>

        {data ? (
          <Suspense fallback={<ChartsLoading />}>
            <CorretivaDashboardCharts trend={data.trend} teams={data.teams} statuses={data.statuses} />
          </Suspense>
        ) : (
          <ChartsLoading />
        )}

        <GlassCard className="overflow-hidden border-white/10 bg-white/[0.035] p-0">
          <div className="flex flex-col gap-2 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Últimas execuções</h2>
              <p className="mt-1 text-xs text-muted-foreground">Movimentações mais recentes do Histórico de Execução.</p>
            </div>
            <span className="text-[11px] text-muted-foreground">{data?.recent.length ?? 0} registros exibidos</span>
          </div>

          {data?.recent.length ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[840px] text-left">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      <th className="px-6 py-3">Data</th>
                      <th className="px-4 py-3">OS</th>
                      <th className="px-4 py-3">Descrição</th>
                      <th className="px-4 py-3">Equipe</th>
                      <th className="px-4 py-3">Local</th>
                      <th className="px-6 py-3 text-right">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.recent.map((event) => (
                      <tr key={event.id} className="transition-colors hover:bg-white/[0.025]">
                        <td className="whitespace-nowrap px-6 py-4 text-xs tabular-nums text-muted-foreground">{formatDateTime(event.ocorridoEm)}</td>
                        <td className="px-4 py-4 font-mono text-xs font-semibold text-foreground">#{event.numeroOs}</td>
                        <td className="max-w-[340px] px-4 py-4">
                          <p className="truncate text-xs font-medium text-foreground/90" title={event.descricao}>{event.descricao}</p>
                          <p className="mt-1 truncate text-[11px] text-muted-foreground">Ativo: {event.ativo}</p>
                        </td>
                        <td className="px-4 py-4 text-xs text-foreground/80">{event.equipe}</td>
                        <td className="max-w-[240px] px-4 py-4 text-xs text-muted-foreground"><span className="line-clamp-2">{event.localizacao}</span></td>
                        <td className="px-6 py-4 text-right">
                          <span className={cn(
                            "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                            event.status === "concluida"
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                              : "border-rose-500/20 bg-rose-500/10 text-rose-400",
                          )}>
                            {event.status === "concluida" ? "Concluída" : "Cancelada"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-white/10 md:hidden">
                {data.recent.map((event) => (
                  <div key={event.id} className="space-y-3 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs font-semibold text-foreground">#{event.numeroOs}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(event.ocorridoEm)}</p>
                      </div>
                      <span className={cn(
                        "rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-wide",
                        event.status === "concluida"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                          : "border-rose-500/20 bg-rose-500/10 text-rose-400",
                      )}>
                        {event.status === "concluida" ? "Concluída" : "Cancelada"}
                      </span>
                    </div>
                    <p className="text-sm font-medium leading-snug text-foreground/90">{event.descricao}</p>
                    <div className="grid grid-cols-2 gap-3 text-[11px] text-muted-foreground">
                      <div><span className="block text-[9px] uppercase tracking-wider text-muted-foreground/60">Equipe</span>{event.equipe}</div>
                      <div><span className="block text-[9px] uppercase tracking-wider text-muted-foreground/60">Ativo</span>{event.ativo}</div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{event.localizacao}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex min-h-[180px] flex-col items-center justify-center px-6 text-center text-sm text-muted-foreground">
              <ListChecks className="mb-3 h-8 w-8 opacity-30" />
              Nenhuma conclusão ou cancelamento encontrado no período selecionado.
            </div>
          )}
        </GlassCard>
      </div>
    </PageShell>
  );
}
