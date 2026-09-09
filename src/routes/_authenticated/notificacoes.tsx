import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  BellRing,
  CheckCheck,
  CheckCircle2,
  ClipboardCheck,
  CloudRain,
  ExternalLink,
  Eye,
  Inbox,
  Info,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Wrench,
  X,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { EmptyState, ErrorState, StatusBadge } from "@/components/pcm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { useNotifications } from "@/hooks/use-notifications";
import { CATEGORIES, categoryMeta, fmtDateTime, PRIORIDADES } from "@/lib/notifications";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notificacoes")({
  head: () => ({
    meta: [
      { title: "Central de Notificações | Apont Auto PCM" },
      {
        name: "description",
        content:
          "Central operacional de avisos do PCM com leitura, confirmação de ciência, preferências e atualização em tempo real.",
      },
      { property: "og:title", content: "Central de Notificações | Apont Auto PCM" },
      {
        property: "og:description",
        content: "Central operacional de avisos com leitura, ciência e organização por prioridade.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificacoesPage,
});

type Filtro = "nao-lidas" | "ciencia" | "todas" | "arquivados";
type Ordenacao = "recentes" | "prioridade";
type MetricTone = "primary" | "warning" | "danger" | "success";

const FILTERS: { key: Filtro; label: string }[] = [
  { key: "nao-lidas", label: "Não lidas" },
  { key: "ciencia", label: "Ciência" },
  { key: "todas", label: "Todas" },
  { key: "arquivados", label: "Arquivadas" },
];

const CHANNELS = [
  {
    key: "inapp",
    label: "No aplicativo",
    description: "Mantém os avisos disponíveis na sua caixa operacional.",
  },
  {
    key: "toast",
    label: "Alerta na tela",
    description: "Exibe um alerta discreto quando um novo aviso chegar.",
  },
  {
    key: "som",
    label: "Alerta sonoro",
    description: "Permite sinalização sonora quando esse canal estiver habilitado.",
  },
  {
    key: "email",
    label: "Resumo por e-mail",
    description: "Canal de resumo por e-mail conforme disponibilidade da integração.",
  },
  {
    key: "whatsapp",
    label: "Resumo por WhatsApp",
    description: "Canal de resumo por WhatsApp conforme disponibilidade da integração.",
  },
] as const;

const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 3,
  warn: 2,
  info: 1,
};

function NotificacoesPage() {
  const {
    items,
    archived,
    unread,
    pendingAck,
    prefs,
    error,
    isLoading,
    refetch,
    markRead,
    acknowledge,
    archiveItems,
    unarchiveItems,
    savePreferences,
    isMutating,
  } = useNotifications();
  const { allowed: podeAdministrar } = useCanAccessModule("notificacoes-admin", "read");

  const [filtro, setFiltro] = useState<Filtro>("nao-lidas");
  const [prefsAbertas, setPrefsAbertas] = useState(false);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("recentes");

  const baseList = useMemo(() => {
    if (filtro === "nao-lidas") return unread;
    if (filtro === "ciencia") return pendingAck;
    if (filtro === "arquivados") return archived;
    return items;
  }, [filtro, items, unread, pendingAck, archived]);

  const lista = useMemo(() => {
    let result = [...baseList];
    const termo = busca.trim().toLocaleLowerCase("pt-BR");

    if (termo) {
      result = result.filter((notification) => {
        const meta = categoryMeta(notification.category);
        return [notification.title, notification.body ?? "", meta.label, notification.module_key ?? ""]
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(termo);
      });
    }

    if (categoria !== "todas") {
      result = result.filter((notification) => notification.category === categoria);
    }

    result.sort((a, b) => {
      if (ordenacao === "prioridade") {
        const severity =
          (PRIORITY_WEIGHT[b.severity] ?? 0) - (PRIORITY_WEIGHT[a.severity] ?? 0);
        if (severity !== 0) return severity;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return result;
  }, [baseList, busca, categoria, ordenacao]);

  const criticalCount = useMemo(
    () => items.filter((notification) => notification.severity === "critical").length,
    [items],
  );
  const readCount = Math.max(items.length - unread.length, 0);
  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return items.filter((notification) => new Date(notification.created_at).toDateString() === today)
      .length;
  }, [items]);
  const hasSecondaryFilters = Boolean(busca.trim()) || categoria !== "todas" || ordenacao !== "recentes";

  const clearSecondaryFilters = () => {
    setBusca("");
    setCategoria("todas");
    setOrdenacao("recentes");
  };

  if (error) {
    return (
      <PageShell
        eyebrow="Comunicação"
        title="Central de Notificações"
        description="Avisos operacionais direcionados a você."
      >
        <InteractionGuard />
        <div className="rounded-[1.5rem] border border-destructive/20 bg-card/70 p-5 shadow-sm backdrop-blur-xl sm:p-7">
          <ErrorState
            title="Não foi possível carregar os avisos"
            description={error.message}
            onRetry={() => refetch()}
          />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Comunicação"
      title="Central de Notificações"
      description="Sua caixa operacional de comunicados, alertas e confirmações de ciência — organizada para leitura rápida e acompanhamento seguro."
      actions={
        podeAdministrar ? (
          <Button asChild size="sm" variant="outline" className="h-11 border-primary/20 bg-card/70 px-4">
            <Link to="/notificacoes-admin">
              <SlidersHorizontal className="size-4" />
              Administrar avisos
            </Link>
          </Button>
        ) : undefined
      }
    >
      <InteractionGuard />

      <section className="relative overflow-hidden rounded-[1.75rem] border border-primary/15 bg-card/70 p-5 shadow-[0_20px_60px_-36px_rgba(0,0,0,0.7)] backdrop-blur-xl sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 size-48 rounded-full bg-sky-500/5 blur-3xl" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:size-14">
              <BellRing className="size-5 sm:size-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/80">
                  Caixa operacional
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/8 px-2.5 py-1 text-[10px] font-semibold text-success">
                  <span className="size-1.5 rounded-full bg-success shadow-[0_0_10px_currentColor]" />
                  Atualização automática ativa
                </span>
              </div>
              <h3 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-foreground sm:text-xl">
                Comunicação priorizada, sem ruído visual
              </h3>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Realtime e verificação periódica mantêm a caixa atualizada. Avisos críticos e itens que
                exigem ciência ganham destaque sem alterar o fluxo já existente.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 lg:min-w-[21rem]">
            <HeroStat label="Hoje" value={todayCount} />
            <HeroStat label="Lidos" value={readCount} />
            <HeroStat label="Arquivados" value={archived.length} />
          </div>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          icon={<Inbox className="size-4" />}
          label="Ativos"
          value={items.length}
          caption="Avisos na caixa"
          tone="primary"
        />
        <MetricCard
          icon={<BellRing className="size-4" />}
          label="Não lidos"
          value={unread.length}
          caption={unread.length === 0 ? "Caixa em dia" : "Aguardando leitura"}
          tone="primary"
        />
        <MetricCard
          icon={<ShieldAlert className="size-4" />}
          label="Ciência pendente"
          value={pendingAck.length}
          caption={pendingAck.length === 0 ? "Nenhuma pendência" : "Requer confirmação"}
          tone="warning"
        />
        <MetricCard
          icon={<AlertTriangle className="size-4" />}
          label="Críticos"
          value={criticalCount}
          caption={criticalCount === 0 ? "Sem alertas críticos" : "Prioridade máxima"}
          tone={criticalCount > 0 ? "danger" : "success"}
        />
      </div>

      <section className="mt-4 overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/65 shadow-[0_22px_70px_-44px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        <div className="border-b border-border/50 p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div
              className="flex w-full gap-1 overflow-x-auto rounded-2xl border border-border/55 bg-background/45 p-1.5 xl:w-auto"
              role="tablist"
              aria-label="Filtrar notificações por estado"
            >
              {FILTERS.map((item) => {
                const count =
                  item.key === "nao-lidas"
                    ? unread.length
                    : item.key === "ciencia"
                      ? pendingAck.length
                      : item.key === "arquivados"
                        ? archived.length
                        : items.length;
                const active = filtro === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFiltro(item.key)}
                    className={cn(
                      "flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-[background-color,border-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 sm:px-3.5",
                      active
                        ? "border-primary/25 bg-primary/12 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                        : "border-transparent text-muted-foreground hover:border-border/60 hover:bg-muted/30 hover:text-foreground",
                    )}
                  >
                    {item.label}
                    <span
                      className={cn(
                        "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] tabular-nums",
                        active ? "bg-primary/15 text-primary" : "bg-muted/60 text-muted-foreground",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={prefsAbertas ? "soft" : "outline"}
                className="h-10"
                onClick={() => setPrefsAbertas((value) => !value)}
                aria-expanded={prefsAbertas}
              >
                <SlidersHorizontal className="size-4" />
                Preferências
              </Button>
              <Button size="sm" variant="outline" className="h-10" onClick={() => refetch()}>
                <RefreshCw className="size-4" />
                Atualizar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-10"
                disabled={unread.length === 0 || isMutating}
                onClick={() => markRead(unread.map((notification) => notification.id))}
              >
                <CheckCheck className="size-4" />
                Marcar todas como lidas
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar por título, mensagem, categoria ou módulo…"
                aria-label="Buscar notificações"
                className="h-11 border-border/60 bg-background/50 pl-10 pr-10 shadow-none"
              />
              {busca ? (
                <button
                  type="button"
                  onClick={() => setBusca("")}
                  className="absolute right-2.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                  aria-label="Limpar busca"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>

            <select
              value={categoria}
              onChange={(event) => setCategoria(event.target.value)}
              aria-label="Filtrar por categoria"
              className="h-11 w-full rounded-xl border border-border/60 bg-background/50 px-3.5 text-sm text-foreground outline-none transition-[border-color,box-shadow,background-color] focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            >
              <option value="todas">Todas as categorias</option>
              {CATEGORIES.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              value={ordenacao}
              onChange={(event) => setOrdenacao(event.target.value as Ordenacao)}
              aria-label="Ordenar notificações"
              className="h-11 w-full rounded-xl border border-border/60 bg-background/50 px-3.5 text-sm text-foreground outline-none transition-[border-color,box-shadow,background-color] focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            >
              <option value="recentes">Mais recentes</option>
              <option value="prioridade">Maior prioridade</option>
            </select>

            {hasSecondaryFilters ? (
              <Button size="sm" variant="ghost" className="h-11 px-3" onClick={clearSecondaryFilters}>
                <X className="size-4" />
                Limpar
              </Button>
            ) : (
              <div className="hidden lg:block" />
            )}
          </div>
        </div>

        {prefsAbertas ? (
          <div className="border-b border-border/50 bg-background/20 p-4 sm:p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Preferências da sua conta</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Defina canais, prioridade mínima e categorias silenciadas. As alterações não afetam outros usuários.
                </p>
              </div>
              <span className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:mt-0">
                Configuração pessoal
              </span>
            </div>

            <div className="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {CHANNELS.map((channel) => (
                <label
                  key={channel.key}
                  className="flex min-h-[5rem] items-center justify-between gap-4 rounded-2xl border border-border/55 bg-card/45 px-4 py-3 transition-[border-color,background-color] hover:border-primary/20 hover:bg-card/70"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">{channel.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                      {channel.description}
                    </span>
                  </span>
                  <Switch
                    checked={Boolean(prefs[channel.key])}
                    onCheckedChange={(value) => savePreferences({ [channel.key]: value })}
                    aria-label={channel.label}
                  />
                </label>
              ))}
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Prioridade mínima
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PRIORIDADES.map((priority) => (
                    <Button
                      key={priority.key}
                      size="sm"
                      variant={prefs.prioridade_minima === priority.key ? "soft" : "outline"}
                      className="h-9"
                      onClick={() => savePreferences({ prioridade_minima: priority.key })}
                    >
                      {priority.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Categorias silenciadas
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CATEGORIES.map((item) => {
                    const muted = prefs.categorias_silenciadas.includes(item.key);
                    return (
                      <Button
                        key={item.key}
                        size="sm"
                        variant={muted ? "soft" : "outline"}
                        className={cn("h-9", muted && "border-warning/20 text-warning")}
                        onClick={() =>
                          savePreferences({
                            categorias_silenciadas: muted
                              ? prefs.categorias_silenciadas.filter((key) => key !== item.key)
                              : [...prefs.categorias_silenciadas, item.key],
                          })
                        }
                      >
                        {muted ? "Silenciada · " : ""}
                        {item.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {filtro === "nao-lidas"
                  ? "Aguardando leitura"
                  : filtro === "ciencia"
                    ? "Aguardando confirmação"
                    : filtro === "arquivados"
                      ? "Arquivo pessoal"
                      : "Todos os avisos ativos"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground" aria-live="polite">
                {lista.length} {lista.length === 1 ? "aviso encontrado" : "avisos encontrados"}
                {baseList.length !== lista.length ? ` de ${baseList.length}` : ""}
              </p>
            </div>
            {isMutating ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/8 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                <RefreshCw className="size-3 animate-spin" />
                Atualizando estado
              </span>
            ) : null}
          </div>

          {isLoading ? (
            <NotificationSkeleton />
          ) : lista.length === 0 ? (
            <EmptyState
              icon={hasSecondaryFilters ? <Search className="size-6" /> : <Inbox className="size-6" />}
              title={hasSecondaryFilters ? "Nenhum aviso corresponde aos filtros" : "Nada por aqui"}
              description={
                hasSecondaryFilters
                  ? "Ajuste a busca, a categoria ou a ordenação para ampliar os resultados."
                  : "Avisos publicados para você aparecem automaticamente, inclusive depois de um período offline."
              }
              action={
                hasSecondaryFilters ? (
                  <Button size="sm" variant="outline" className="h-10" onClick={clearSecondaryFilters}>
                    Limpar filtros
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-3">
              {lista.map((notification) => {
                const meta = categoryMeta(notification.category);
                const precisaCiencia = notification.requires_ack && !notification.isAcked;
                const link = notification.deep_link ?? notification.link_url;

                return (
                  <article
                    key={notification.id}
                    className={cn(
                      "group relative overflow-hidden rounded-[1.35rem] border bg-background/32 p-4 transition-[border-color,background-color,box-shadow] duration-200 sm:p-5",
                      "hover:border-primary/18 hover:bg-card/48 hover:shadow-[0_16px_44px_-34px_rgba(0,0,0,0.7)]",
                      !notification.isRead && "border-primary/28 bg-primary/[0.045]",
                      precisaCiencia && "border-destructive/32 bg-destructive/[0.045]",
                    )}
                  >
                    {!notification.isRead ? (
                      <span className="absolute bottom-4 left-0 top-4 w-0.5 rounded-r-full bg-primary shadow-[0_0_12px_currentColor]" />
                    ) : null}

                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="flex min-w-0 gap-3.5">
                        <div
                          className={cn(
                            "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border",
                            categoryVisual(meta.tone),
                          )}
                        >
                          <CategoryIcon category={notification.category} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge tone={meta.tone} status={meta.label} />
                            {!notification.isRead ? (
                              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
                                Nova
                              </span>
                            ) : null}
                            {precisaCiencia ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-destructive/25 bg-destructive/8 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-destructive">
                                <AlertTriangle className="size-3" />
                                Exige ciência
                              </span>
                            ) : null}
                            {notification.isAcked && notification.requires_ack ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/8 px-2 py-1 text-[10px] font-semibold text-success">
                                <CheckCircle2 className="size-3" />
                                Ciência confirmada
                              </span>
                            ) : null}
                          </div>

                          <h3 className="mt-2.5 break-words text-[15px] font-semibold leading-snug tracking-[-0.01em] text-foreground sm:text-base">
                            {notification.title}
                          </h3>
                          {notification.body ? (
                            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                              {notification.body}
                            </p>
                          ) : null}

                          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span>{fmtDateTime(notification.created_at)}</span>
                            {notification.module_key ? (
                              <span className="rounded-full bg-muted/45 px-2 py-0.5 font-medium">
                                Módulo · {notification.module_key}
                              </span>
                            ) : null}
                            {notification.expires_at ? (
                              <span>Expira em {fmtDateTime(notification.expires_at)}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/40 pt-3 xl:max-w-[24rem] xl:justify-end xl:border-0 xl:pt-0">
                        {link ? (
                          <Button asChild size="sm" variant="outline" className="h-9">
                            <a
                              href={link}
                              onClick={() => {
                                if (!notification.isRead) markRead([notification.id]);
                              }}
                            >
                              <ExternalLink className="size-3.5" />
                              Abrir
                            </a>
                          </Button>
                        ) : null}

                        {!notification.isRead ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-9"
                            disabled={isMutating}
                            onClick={() => markRead([notification.id])}
                          >
                            <Eye className="size-3.5" />
                            Marcar lida
                          </Button>
                        ) : null}

                        {precisaCiencia ? (
                          <Button
                            size="sm"
                            className="h-9"
                            disabled={isMutating}
                            onClick={() => acknowledge(notification.id)}
                          >
                            <CheckCheck className="size-3.5" />
                            Confirmar ciência
                          </Button>
                        ) : null}

                        {notification.isArchived ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-9"
                            disabled={isMutating}
                            onClick={() => unarchiveItems([notification.id])}
                          >
                            <ArchiveRestore className="size-3.5" />
                            Desarquivar
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-9 text-muted-foreground"
                            disabled={isMutating}
                            onClick={() => archiveItems([notification.id])}
                          >
                            <Archive className="size-3.5" />
                            Arquivar
                          </Button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </PageShell>
  );
}

function InteractionGuard() {
  return (
    <style>{`
      [data-page-title="Central de Notificações"] [data-slot="button"] {
        transition-property: box-shadow, background-color, color, border-color, filter, opacity !important;
      }

      [data-page-title="Central de Notificações"] [data-slot="button"]:hover,
      [data-page-title="Central de Notificações"] [data-slot="button"]:active,
      [data-page-title="Central de Notificações"] .glass-block:active,
      [data-page-title="Central de Notificações"] .glass-surface:active {
        transform: none !important;
      }

      [data-page-title="Central de Notificações"] button:active,
      [data-page-title="Central de Notificações"] input:active,
      [data-page-title="Central de Notificações"] select:active {
        transform: none !important;
      }

      @media (prefers-reduced-motion: reduce) {
        [data-page-title="Central de Notificações"] * {
          scroll-behavior: auto !important;
        }
      }
    `}</style>
  );
}

function HeroStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/55 bg-background/35 px-3 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  caption,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  caption: string;
  tone: MetricTone;
}) {
  const toneClass: Record<MetricTone, string> = {
    primary: "border-primary/18 bg-primary/[0.035] text-primary",
    warning: "border-warning/18 bg-warning/[0.035] text-warning",
    danger: "border-destructive/20 bg-destructive/[0.04] text-destructive",
    success: "border-success/18 bg-success/[0.035] text-success",
  };

  return (
    <div className="rounded-[1.35rem] border border-border/55 bg-card/60 p-4 shadow-[0_14px_40px_-34px_rgba(0,0,0,0.7)] backdrop-blur-xl sm:p-4.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-[-0.03em] text-foreground">
            {value}
          </p>
        </div>
        <span className={cn("flex size-9 items-center justify-center rounded-xl border", toneClass[tone])}>
          {icon}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{caption}</p>
    </div>
  );
}

function CategoryIcon({ category }: { category: string }) {
  const Icon =
    category === "sucesso"
      ? CheckCircle2
      : category === "atencao" || category === "critico"
        ? AlertTriangle
        : category === "manutencao"
          ? Wrench
          : category === "clima"
            ? CloudRain
            : category === "pt"
              ? ClipboardCheck
              : category === "seguranca"
                ? ShieldAlert
                : category === "informacao"
                  ? Info
                  : BellRing;

  return <Icon className="size-4" />;
}

function categoryVisual(tone: string) {
  if (tone === "danger") return "border-destructive/20 bg-destructive/8 text-destructive";
  if (tone === "warning") return "border-warning/20 bg-warning/8 text-warning";
  if (tone === "success") return "border-success/20 bg-success/8 text-success";
  if (tone === "neutral") return "border-border/60 bg-muted/45 text-muted-foreground";
  return "border-primary/20 bg-primary/8 text-primary";
}

function NotificationSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Carregando notificações">
      {[0, 1, 2].map((item) => (
        <div key={item} className="rounded-[1.35rem] border border-border/45 bg-background/25 p-4 sm:p-5">
          <div className="flex gap-3.5">
            <div className="size-10 shrink-0 animate-pulse rounded-xl bg-primary/8" />
            <div className="min-w-0 flex-1">
              <div className="h-5 w-28 animate-pulse rounded-full bg-primary/8" />
              <div className="mt-3 h-4 w-2/5 animate-pulse rounded-md bg-primary/8" />
              <div className="mt-2 h-3 w-4/5 animate-pulse rounded-md bg-primary/6" />
              <div className="mt-2 h-3 w-3/5 animate-pulse rounded-md bg-primary/6" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
