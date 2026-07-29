import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertOctagon,
  CloudCog,
  Gauge,
  Lock,
  RefreshCw,
  RotateCw,
  Upload,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { qk, staleTimes } from "@/lib/query/keys";
import { fetchObservability, fetchOfflineQueue } from "../queries/observability";
import type { HealthStatus } from "../types";

const statusTone: Record<HealthStatus, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  degradado: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  falha: "border-destructive/40 bg-destructive/10 text-destructive",
  desconhecido: "border-border/60 bg-muted/30 text-muted-foreground",
};

function fmt(dt: string | null | undefined) {
  if (!dt) return "—";
  const d = new Date(dt);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
}

export function ObservabilityView() {
  const { isAdmin, loading } = useIsAdmin();
  const { allowed, isLoading: loadingPerm } = useCanAccessModule("observabilidade", "read");
  const canSee = isAdmin || allowed;
  const [showDetail, setShowDetail] = useState<string | null>(null);

  const snapshot = useQuery({
    queryKey: qk.observability(),
    queryFn: ({ signal }) => fetchObservability(signal),
    staleTime: staleTimes.short,
    refetchInterval: 60_000,
    enabled: canSee,
  });

  const offline = useQuery({
    queryKey: qk.offlineQueue(),
    queryFn: fetchOfflineQueue,
    staleTime: staleTimes.short,
    enabled: canSee,
  });

  const data = snapshot.data;
  const falhando = useMemo(
    () => (data?.integrations ?? []).filter((i) => i.status !== "ok").length,
    [data],
  );
  const pendentes = (offline.data ?? []).reduce((s, q) => s + q.pending, 0);

  if (loading || loadingPerm) {
    return (
      <PageShell title="Painel Técnico">
        <GlassCard>
          <p className="text-sm text-muted-foreground">Verificando permissões…</p>
        </GlassCard>
      </PageShell>
    );
  }

  if (!canSee) {
    return (
      <PageShell eyebrow="Observabilidade" title="Acesso restrito">
        <GlassCard className="flex items-center gap-3">
          <Lock className="h-5 w-5 text-destructive" />
          <p className="text-sm text-muted-foreground">
            O painel técnico é exclusivo da administração. Se algo não estiver funcionando, avise a
            equipe responsável — os detalhes técnicos já foram registrados automaticamente.
          </p>
        </GlassCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Observabilidade"
      title="Painel Técnico"
      description="Saúde do sistema em um lugar só: erros de frontend, falhas de rotinas automáticas, integrações externas, uploads com problema, fila offline pendente, tempo de resposta e última sincronização."
      actions={
        <Button
          variant="outline"
          onClick={() => {
            snapshot.refetch();
            offline.refetch();
          }}
          disabled={snapshot.isFetching}
        >
          <RefreshCw className={`mr-1.5 h-4 w-4 ${snapshot.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      }
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <GlassCard variant="block">
          <div className="text-eyebrow flex items-center gap-1.5">
            <AlertOctagon className="h-3.5 w-3.5" /> Erros (24h)
          </div>
          <div className="mt-1 text-2xl font-bold text-destructive">{data?.errors24h ?? 0}</div>
        </GlassCard>
        <GlassCard variant="block">
          <div className="text-eyebrow flex items-center gap-1.5">
            <CloudCog className="h-3.5 w-3.5" /> Integrações com problema
          </div>
          <div className="mt-1 text-2xl font-bold">{falhando}</div>
        </GlassCard>
        <GlassCard variant="block">
          <div className="text-eyebrow flex items-center gap-1.5">
            <RotateCw className="h-3.5 w-3.5" /> Fila offline
          </div>
          <div className="mt-1 text-2xl font-bold">{pendentes}</div>
        </GlassCard>
        <GlassCard variant="block">
          <div className="text-eyebrow flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5" /> Tempo médio
          </div>
          <div className="mt-1 text-2xl font-bold">
            {data?.avgResponseMs != null ? `${data.avgResponseMs} ms` : "—"}
          </div>
        </GlassCard>
        <GlassCard variant="block">
          <div className="text-eyebrow flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Última sincronização
          </div>
          <div className="mt-1 text-sm font-semibold">{fmt(data?.lastSyncAt)}</div>
        </GlassCard>
      </div>

      <Tabs defaultValue="erros">
        <TabsList className="flex-wrap">
          <TabsTrigger value="erros">Erros de frontend</TabsTrigger>
          <TabsTrigger value="rotinas">Rotinas e cron</TabsTrigger>
          <TabsTrigger value="integracoes">Integrações</TabsTrigger>
          <TabsTrigger value="uploads">Uploads</TabsTrigger>
          <TabsTrigger value="offline">Fila offline</TabsTrigger>
        </TabsList>

        <TabsContent value="erros" className="space-y-2 pt-3">
          {(data?.errors ?? []).length === 0 && (
            <GlassCard>
              <p className="text-sm text-muted-foreground">Nenhum erro registrado.</p>
            </GlassCard>
          )}
          {(data?.errors ?? []).map((e) => (
            <GlassCard key={e.id} className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge className={statusTone[e.level === "error" ? "falha" : "degradado"]}>
                    {e.level}
                  </Badge>
                  <span className="font-medium">{e.message}</span>
                </div>
                <span className="text-xs text-muted-foreground">{fmt(e.createdAt)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {[e.origin, e.route, e.moduleKey].filter(Boolean).join(" · ")}
              </div>
              {e.detail && (
                <div>
                  <button
                    type="button"
                    className="text-xs underline text-muted-foreground"
                    onClick={() => setShowDetail(showDetail === e.id ? null : e.id)}
                  >
                    {showDetail === e.id ? "Ocultar detalhe técnico" : "Ver detalhe técnico"}
                  </button>
                  {showDetail === e.id && (
                    <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-muted/40 p-2 text-[11px] leading-tight">
                      {e.detail}
                    </pre>
                  )}
                </div>
              )}
            </GlassCard>
          ))}
        </TabsContent>

        <TabsContent value="rotinas" className="space-y-2 pt-3">
          {(data?.jobFailures ?? []).length === 0 && (
            <GlassCard>
              <p className="text-sm text-muted-foreground">Nenhuma rotina com falha.</p>
            </GlassCard>
          )}
          {(data?.jobFailures ?? []).map((j) => (
            <GlassCard key={`${j.source}-${j.id}`} className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">
                  {j.source} — {j.reference}
                </div>
                <div className="truncate text-xs text-muted-foreground">{j.message}</div>
              </div>
              <span className="text-xs text-muted-foreground">{fmt(j.at)}</span>
            </GlassCard>
          ))}
        </TabsContent>

        <TabsContent value="integracoes" className="grid gap-3 pt-3 sm:grid-cols-2">
          {(data?.integrations ?? []).map((i) => (
            <GlassCard key={i.integration} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{i.integration}</span>
                <Badge className={statusTone[i.status]}>{i.status}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                Última execução: {fmt(i.lastRunAt)}
                {i.durationMs != null ? ` · ${i.durationMs} ms` : ""}
              </div>
              {i.message && <p className="text-xs text-muted-foreground">{i.message}</p>}
            </GlassCard>
          ))}
          {(data?.integrations ?? []).length === 0 && (
            <GlassCard>
              <p className="text-sm text-muted-foreground">Sem sinais de integração recentes.</p>
            </GlassCard>
          )}
        </TabsContent>

        <TabsContent value="uploads" className="space-y-2 pt-3">
          {(data?.uploadFailures ?? []).length === 0 && (
            <GlassCard>
              <p className="text-sm text-muted-foreground">Nenhuma falha de upload registrada.</p>
            </GlassCard>
          )}
          {(data?.uploadFailures ?? []).map((u) => (
            <GlassCard key={u.id} className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Upload className="h-4 w-4 text-amber-400" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{u.message}</div>
                  <div className="text-xs text-muted-foreground">{u.reference}</div>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">{fmt(u.at)}</span>
            </GlassCard>
          ))}
        </TabsContent>

        <TabsContent value="offline" className="space-y-2 pt-3">
          {(offline.data ?? []).length === 0 && (
            <GlassCard>
              <p className="text-sm text-muted-foreground">
                Nenhum item pendente de sincronização neste dispositivo.
              </p>
            </GlassCard>
          )}
          {(offline.data ?? []).map((q) => (
            <GlassCard key={q.module} className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{q.module}</span>
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline">{q.pending} pendente(s)</Badge>
                {q.dead > 0 && (
                  <Badge className={statusTone.falha}>{q.dead} em falha definitiva</Badge>
                )}
                {q.oldestAt && (
                  <span className="text-muted-foreground">
                    mais antigo: {new Date(q.oldestAt).toLocaleString("pt-BR")}
                  </span>
                )}
              </div>
            </GlassCard>
          ))}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
