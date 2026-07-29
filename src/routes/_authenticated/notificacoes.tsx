import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCheck,
  Inbox,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, KpiCard, StatusBadge } from "@/components/pcm";
import { useNotifications } from "@/hooks/use-notifications";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { categoryMeta, fmtDateTime } from "@/lib/notifications";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notificacoes")({
  head: () => ({
    meta: [
      { title: "Central de Notificações | Apont Auto PCM" },
      {
        name: "description",
        content:
          "Inbox de avisos operacionais do PCM: alertas críticos, comunicados de equipe, leitura e confirmação de ciência.",
      },
      { property: "og:title", content: "Central de Notificações | Apont Auto PCM" },
      {
        property: "og:description",
        content: "Inbox de avisos operacionais com leitura e confirmação de ciência.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificacoesPage,
});

type Filtro = "nao-lidas" | "ciencia" | "todas";

function NotificacoesPage() {
  const {
    items,
    unread,
    pendingAck,
    error,
    isLoading,
    refetch,
    markRead,
    acknowledge,
    isMutating,
  } = useNotifications();
  const { allowed: podeAdministrar } = useCanAccessModule("notificacoes-admin", "read");
  const [filtro, setFiltro] = useState<Filtro>("nao-lidas");

  const lista = useMemo(() => {
    if (filtro === "nao-lidas") return unread;
    if (filtro === "ciencia") return pendingAck;
    return items;
  }, [filtro, items, unread, pendingAck]);

  if (error) {
    return (
      <PageShell
        eyebrow="Comunicação"
        title="Central de Notificações"
        description="Avisos operacionais direcionados a você."
      >
        <GlassCard variant="block" className="p-6">
          <ErrorState
            title="Não foi possível carregar os avisos"
            description={error.message}
            onRetry={refetch}
          />
        </GlassCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Comunicação"
      title="Central de Notificações"
      description="Avisos direcionados a você por pessoa, papel, módulo ou equipe — com leitura e confirmação de ciência."
      actions={
        podeAdministrar ? (
          <Button asChild size="sm" className="h-11">
            <Link to="/notificacoes-admin">Administrar avisos</Link>
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard icon={<Inbox className="size-4" />} label="Ativos" value={String(items.length)} />
        <KpiCard icon={<BellRing className="size-4" />} label="Não lidos" value={String(unread.length)} />
        <KpiCard
          icon={<ShieldAlert className="size-4" />}
          label="Ciência pendente"
          value={String(pendingAck.length)}
        />
        <KpiCard
          icon={<CheckCheck className="size-4" />}
          label="Lidos"
          value={String(items.length - unread.length)}
        />
      </div>

      <GlassCard variant="block" className="mt-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["nao-lidas", `Não lidos (${unread.length})`],
                ["ciencia", `Ciência (${pendingAck.length})`],
                ["todas", "Todos"],
              ] as const
            ).map(([k, label]) => (
              <Button
                key={k}
                size="sm"
                variant={filtro === k ? "default" : "outline"}
                className="h-11"
                onClick={() => setFiltro(k as Filtro)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-11" onClick={refetch}>
              <RefreshCw className="mr-2 size-4" />
              Atualizar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-11"
              disabled={unread.length === 0 || isMutating}
              onClick={() => markRead(unread.map((n) => n.id))}
            >
              <CheckCheck className="mr-2 size-4" />
              Marcar tudo como lido
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando avisos…</p>
          ) : lista.length === 0 ? (
            <EmptyState
              icon={<Inbox className="size-6" />}
              title="Nada por aqui"
              description="Avisos publicados para você aparecem automaticamente, mesmo depois de voltar de um período offline."
            />
          ) : (
            lista.map((n) => {
              const meta = categoryMeta(n.category);
              const precisaCiencia = n.requires_ack && !n.isAcked;
              const link = n.deep_link ?? n.link_url;
              return (
                <article
                  key={n.id}
                  className={cn(
                    "rounded-2xl border border-border/60 bg-card/40 p-4 transition-colors",
                    !n.isRead && "border-primary/40 bg-primary/[0.06]",
                    precisaCiencia && "border-destructive/50 bg-destructive/[0.06]",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={meta.tone} status={meta.label} />
                        {precisaCiencia ? (
                          <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-destructive">
                            <AlertTriangle className="size-3" /> exige confirmação
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-2 font-semibold leading-snug">{n.title}</h3>
                      {n.body ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                          {n.body}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-muted-foreground">
                        {fmtDateTime(n.created_at)}
                        {n.expires_at ? ` · expira em ${fmtDateTime(n.expires_at)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      {link ? (
                        <Button asChild size="sm" variant="outline" className="h-11">
                          <Link to={link}>Abrir</Link>
                        </Button>
                      ) : null}
                      {!n.isRead ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-11"
                          onClick={() => markRead([n.id])}
                        >
                          Marcar lida
                        </Button>
                      ) : null}
                      {precisaCiencia ? (
                        <Button size="sm" className="h-11" onClick={() => acknowledge(n.id)}>
                          Confirmar ciência
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </GlassCard>
    </PageShell>
  );
}
