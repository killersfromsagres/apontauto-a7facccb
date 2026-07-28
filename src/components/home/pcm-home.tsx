import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Gauge,
  Inbox,
  Percent,
  Rows3,
  SearchX,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useVisibleSections, allMenuItems, type MenuItem } from "@/lib/nav-config";
import { fetchFillMetrics } from "@/features/assets/services/fill-metrics";
import { getActiveCatalog } from "@/features/assets/services/asset-catalog";
import { listJobs } from "@/features/assets/services/fill-jobs";

const UNIT = "In Haus Industrial · São Bernardo do Campo — SP";
const STALE_DAYS = 90;

/** Atalhos operacionais pedidos, na ordem — filtrados por permissão. */
const SHORTCUT_KEYS = [
  "backorder",
  "programacao",
  "corretiva",
  "refrigeracao",
  "controle-materiais",
  "seguranca-trabalho",
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

const nf = new Intl.NumberFormat("pt-BR");
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export function PcmHome({ userName }: { userName?: string | null }) {
  const { visibleItems, canAccess } = useVisibleSections();
  const canFill = canAccess("assets-fill");
  const canCatalog = canAccess("assets-catalog");

  const metrics = useQuery({
    queryKey: ["pcm", "fill-metrics"],
    queryFn: fetchFillMetrics,
    staleTime: 60_000,
    enabled: canFill || canCatalog,
  });

  const catalog = useQuery({
    queryKey: ["pcm", "active-catalog"],
    queryFn: getActiveCatalog,
    staleTime: 5 * 60_000,
    enabled: canFill || canCatalog,
  });

  const jobs = useQuery({
    queryKey: ["pcm", "recent-jobs"],
    queryFn: () => listJobs(5),
    staleTime: 60_000,
    enabled: canFill,
  });

  const shortcuts = useMemo(() => {
    const byKey = new Map(visibleItems.map((i) => [i.key, i]));
    return SHORTCUT_KEYS.map((k) => byKey.get(k)).filter(Boolean) as MenuItem[];
  }, [visibleItems]);

  const cat = catalog.data as
    | { name: string; version: number; total_assets: number | null; imported_at: string | null }
    | null
    | undefined;

  const importedAt = cat?.imported_at ? new Date(cat.imported_at) : null;
  const ageDays = importedAt ? Math.floor((Date.now() - importedAt.getTime()) / 86_400_000) : null;
  const catalogStale = !catalog.isLoading && (!cat || (ageDays !== null && ageDays > STALE_DAYS));

  const m = metrics.data;
  const fillItem = allMenuItems.find((i) => i.key === "assets-fill");

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl animate-fade-in space-y-5 p-3 sm:space-y-6 sm:p-4 md:p-8">
      {/* Cabeçalho */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 border-b border-border/50 pb-5 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <div className="text-eyebrow mb-2 text-primary">Central Operacional PCM</div>
          <h1 className="font-display text-[1.5rem] font-bold leading-[1.1] tracking-tight sm:text-4xl">
            <span className="text-gradient">
              {greeting()}
              {userName ? `, ${userName}` : ""}
            </span>
          </h1>
          <p className="mt-1.5 truncate text-[13px] text-muted-foreground sm:text-sm">{UNIT}</p>
        </div>
        {canFill && fillItem && (
          <Button asChild size="lg" className="shrink-0 gap-2 rounded-xl shadow-lg shadow-primary/20">
            <Link to={fillItem.url}>
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Preencher localização de ativos</span>
              <span className="sm:hidden">Preencher</span>
            </Link>
          </Button>
        )}
      </header>

      {/* Alerta de base desatualizada */}
      {(canFill || canCatalog) && catalogStale && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-amber-200">
              {cat ? "Base de ativos desatualizada" : "Nenhuma base de ativos ativa"}
            </p>
            <p className="text-xs text-amber-200/80">
              {cat
                ? `Última importação há ${ageDays} dias (${fmtDate(cat.imported_at)}). Importe uma nova versão para manter as localizações corretas.`
                : "Importe um catálogo em Base de Ativos para habilitar a resolução hierárquica de prédio, andar e ambiente."}
            </p>
          </div>
          {canCatalog && (
            <Button asChild size="sm" variant="outline" className="rounded-lg border-amber-500/40">
              <Link to="/base-ativos">Abrir Base de Ativos</Link>
            </Button>
          )}
        </div>
      )}

      {/* KPIs */}
      {(canFill || canCatalog) && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Arquivos processados"
            value={m ? nf.format(m.files) : null}
            hint={m ? `${nf.format(m.files30d)} nos últimos 30 dias` : undefined}
            icon={FileSpreadsheet}
            tone="blue"
            loading={metrics.isLoading}
          />
          <Kpi
            label="Linhas preenchidas"
            value={m ? nf.format(m.rowsMatched) : null}
            hint={m ? `de ${nf.format(m.rowsTotal)} linhas com ativo` : undefined}
            icon={Rows3}
            tone="violet"
            loading={metrics.isLoading}
          />
          <Kpi
            label="Taxa de correspondência"
            value={m ? `${m.matchRate.toLocaleString("pt-BR")}%` : null}
            hint={m && m.rowsTotal === 0 ? "sem processamentos" : "média histórica"}
            icon={Percent}
            tone={m && m.matchRate >= 90 ? "green" : "blue"}
            loading={metrics.isLoading}
          />
          <Kpi
            label="Ativos pendentes"
            value={m ? nf.format(m.pendingUnmatched) : null}
            hint={m && m.pendingUnmatched === 0 ? "nada a resolver" : "aguardando resolução"}
            icon={SearchX}
            tone={m && m.pendingUnmatched > 0 ? "amber" : "green"}
            loading={metrics.isLoading}
            to={m && m.pendingUnmatched > 0 ? "/inteligencia-ativos/nao-encontrados" : undefined}
          />
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Histórico recente */}
        {canFill && (
          <section className="glow-card lg:col-span-2">
            <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Gauge className="h-4 w-4 text-primary" /> Histórico recente
              </h2>
              <Button asChild size="sm" variant="ghost" className="h-8 gap-1 text-xs">
                <Link to="/inteligencia-ativos/historico">
                  Ver tudo <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>

            {jobs.isLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : (jobs.data?.length ?? 0) === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Nenhum processamento ainda"
                description="Envie a primeira planilha para preencher prédio, andar e ambiente automaticamente."
                action={
                  fillItem ? (
                    <Button asChild size="sm" className="rounded-lg">
                      <Link to={fillItem.url}>Preencher planilha</Link>
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="divide-y divide-border/40">
                {jobs.data!.map((j) => {
                  const rate = j.total_rows > 0 ? Math.round((j.matched_rows / j.total_rows) * 100) : 0;
                  return (
                    <li key={j.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{j.file_name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {fmtDate(j.created_at)} · {nf.format(j.total_rows)} linhas ·{" "}
                          {nf.format(j.unmatched_rows)} sem match
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                          rate >= 90
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : rate >= 60
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                              : "border-destructive/30 bg-destructive/10 text-destructive",
                        )}
                      >
                        {rate}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {/* Base ativa */}
        {(canFill || canCatalog) && (
          <section className="glow-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4 text-primary" /> Base de ativos ativa
            </h2>
            {catalog.isLoading ? (
              <Skeleton className="mt-3 h-20 w-full rounded-lg" />
            ) : cat ? (
              <div className="mt-3 space-y-2 text-sm">
                <p className="truncate font-medium">{cat.name}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                    versão v{cat.version}
                  </span>
                  <span className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground">
                    {nf.format(cat.total_assets ?? 0)} ativos
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Importada em {fmtDate(cat.imported_at)}
                </p>
                {!catalogStale && (
                  <p className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Base atualizada
                  </p>
                )}
              </div>
            ) : (
              <EmptyState
                icon={Database}
                title="Sem catálogo ativo"
                description="Nenhuma versão da base foi ativada."
                action={
                  canCatalog ? (
                    <Button asChild size="sm" variant="outline" className="rounded-lg">
                      <Link to="/base-ativos">Importar base</Link>
                    </Button>
                  ) : undefined
                }
              />
            )}
          </section>
        )}
      </div>

      {/* Atalhos */}
      {shortcuts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-eyebrow text-primary">Módulos liberados</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {shortcuts.map((item) => (
              <Link
                key={item.key}
                to={item.url}
                preload="intent"
                className="glow-card group flex min-h-[6rem] flex-col justify-between gap-3 p-3 transition-transform active:scale-[0.98] sm:min-h-[7rem] sm:p-4"
              >
                <item.icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
                <span className="text-[13px] font-medium leading-tight">{item.title}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const TONES: Record<string, string> = {
  blue: "from-primary/20 to-transparent text-primary",
  violet: "from-violet-500/20 to-transparent text-violet-300",
  green: "from-emerald-500/20 to-transparent text-emerald-300",
  amber: "from-amber-500/20 to-transparent text-amber-300",
};

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = "blue",
  loading,
  to,
}: {
  label: string;
  value: string | null;
  hint?: string;
  icon: typeof Gauge;
  tone?: keyof typeof TONES | string;
  loading?: boolean;
  to?: string;
}) {
  const body = (
    <div className="glow-card relative h-full overflow-hidden p-3.5 sm:p-4">
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b opacity-70",
          TONES[tone] ?? TONES.blue,
        )}
      />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <Icon className={cn("h-4 w-4 shrink-0", (TONES[tone] ?? TONES.blue).split(" ").pop())} />
      </div>
      {loading || value === null ? (
        <Skeleton className="relative mt-3 h-7 w-20 rounded" />
      ) : (
        <p className="relative mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {value}
        </p>
      )}
      {hint && <p className="relative mt-1 truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
  return to ? (
    <Link to={to} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Gauge;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <Icon className="h-6 w-6 text-muted-foreground/60" />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
