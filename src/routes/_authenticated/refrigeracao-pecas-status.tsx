import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Package,
  RefreshCw,
  Clock,
  Search as SearchIcon,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/refrigeracao-pecas-status")({
  component: PecasStatusPage,
  head: () => ({
    meta: [
      { title: "Status de Peças · Refrigeração — Apont Auto" },
      {
        name: "description",
        content:
          "Acompanhe em tempo real o andamento das solicitações de peças de Refrigeração — do pedido ao aprovado.",
      },
      { property: "og:title", content: "Status de Peças · Refrigeração" },
      {
        property: "og:description",
        content: "Acompanhamento em tempo real das solicitações de peças.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type StatusGestor = "pendente" | "em_analise" | "aprovado" | "rejeitado" | "concluido";

type PecaRow = {
  id: string;
  os_id: string;
  descricao: string;
  quantidade: number;
  urgencia: string;
  observacao: string | null;
  status_gestor: StatusGestor;
  created_at: string;
  updated_at: string;
};

type OsRow = {
  id: string;
  numero_os: string;
  nome_os: string | null;
  predio: string | null;
  andar: string | null;
  local: string | null;
  equipe: string | null;
};

const STATUS_META: Record<
  StatusGestor,
  { label: string; badge: string; icon: typeof Package; order: number }
> = {
  pendente: {
    label: "Pendente",
    badge:
      "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
    icon: Clock,
    order: 0,
  },
  em_analise: {
    label: "Em análise",
    badge:
      "bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-300",
    icon: Loader2,
    order: 1,
  },
  aprovado: {
    label: "Aprovado",
    badge:
      "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
    icon: CheckCircle2,
    order: 2,
  },
  rejeitado: {
    label: "Rejeitado",
    badge:
      "bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300",
    icon: XCircle,
    order: 3,
  },
  concluido: {
    label: "Concluído",
    badge:
      "bg-violet-500/15 text-violet-700 border-violet-500/30 dark:text-violet-300",
    icon: Sparkles,
    order: 4,
  },
};

const STAGES: StatusGestor[] = ["pendente", "em_analise", "aprovado", "concluido"];

function urgencyBadge(u: string): string {
  const k = (u ?? "").toLowerCase();
  if (k === "alta")
    return "bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300";
  if (k === "media" || k === "média")
    return "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300";
  return "bg-slate-500/15 text-slate-700 border-slate-500/30 dark:text-slate-300";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s atrás`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}min atrás`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.round(h / 24);
  return `${d}d atrás`;
}

function PecasStatusPage() {
  const [pecas, setPecas] = useState<PecaRow[]>([]);
  const [osById, setOsById] = useState<Map<string, OsRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | StatusGestor>("todos");

  const load = async () => {
    setLoading(true);
    const { data: pcs, error } = await supabase
      .from("refrigeracao_pecas")
      .select(
        "id, os_id, descricao, quantidade, urgencia, observacao, status_gestor, created_at, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) {
      toast.error(`Erro ao carregar: ${error.message}`);
      setLoading(false);
      return;
    }
    const rows = (pcs ?? []) as PecaRow[];
    setPecas(rows);
    const ids = Array.from(new Set(rows.map((r) => r.os_id)));
    if (ids.length > 0) {
      const { data: os } = await supabase
        .from("refrigeracao_os")
        .select("id, numero_os, nome_os, predio, andar, local, equipe")
        .in("id", ids);
      const m = new Map<string, OsRow>();
      (os ?? []).forEach((o: any) => m.set(o.id, o));
      setOsById(m);
    } else {
      setOsById(new Map());
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Realtime — feedback imediato quando o gestor muda o status
  useEffect(() => {
    const channel = supabase
      .channel("refrigeracao_pecas_status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "refrigeracao_pecas" },
        (payload) => {
          const oldRow = payload.old as PecaRow | null;
          const newRow = payload.new as PecaRow | null;
          setPecas((prev) => {
            if (payload.eventType === "INSERT" && newRow) {
              if (prev.some((p) => p.id === newRow.id)) return prev;
              return [newRow, ...prev];
            }
            if (payload.eventType === "UPDATE" && newRow) {
              if (
                oldRow &&
                newRow.status_gestor !== oldRow.status_gestor
              ) {
                const meta = STATUS_META[newRow.status_gestor];
                toast.success(
                  `Peça “${newRow.descricao}” agora está: ${meta?.label ?? newRow.status_gestor}`,
                );
              }
              return prev.map((p) => (p.id === newRow.id ? { ...p, ...newRow } : p));
            }
            if (payload.eventType === "DELETE" && oldRow) {
              return prev.filter((p) => p.id !== oldRow.id);
            }
            return prev;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pecas.filter((p) => {
      if (statusFilter !== "todos" && p.status_gestor !== statusFilter) return false;
      if (!q) return true;
      const os = osById.get(p.os_id);
      const hay = [
        p.descricao,
        p.observacao ?? "",
        os?.numero_os ?? "",
        os?.nome_os ?? "",
        os?.predio ?? "",
        os?.local ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [pecas, osById, search, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<StatusGestor, number> = {
      pendente: 0,
      em_analise: 0,
      aprovado: 0,
      rejeitado: 0,
      concluido: 0,
    };
    for (const p of pecas) c[p.status_gestor] = (c[p.status_gestor] ?? 0) + 1;
    return c;
  }, [pecas]);

  return (
    <PageShell
      title="Status de Peças"
      description="Acompanhe em tempo real o andamento das suas solicitações de peças."
      actions={
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3">
        {(Object.keys(STATUS_META) as StatusGestor[]).map((k) => {
          const meta = STATUS_META[k];
          const Icon = meta.icon;
          const active = statusFilter === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setStatusFilter(active ? "todos" : k)}
              className={`group text-left transition ${
                active ? "scale-[1.02]" : "hover:scale-[1.01]"
              }`}
            >
              <GlassCard
                className={`p-2 sm:p-3 ${active ? "ring-2 ring-primary/60" : ""}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-[9px] font-medium uppercase tracking-wider text-muted-foreground sm:text-[10px]">
                    {meta.label}
                  </span>
                  <Icon className="h-3 w-3 shrink-0 text-muted-foreground sm:h-3.5 sm:w-3.5" />
                </div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums sm:text-xl">
                  {counts[k]}
                </div>
              </GlassCard>
            </button>
          );
        })}
      </div>


      <GlassCard className="mt-4 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2">
            <SearchIcon className="h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por peça, OS, prédio, local…"
              className="h-11 text-base"
            />
          </div>
          <div className="flex items-center gap-2 sm:min-w-[220px]">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Status
            </span>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as "todos" | StatusGestor)}
            >
              <SelectTrigger className="h-11 flex-1 text-base sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {(Object.keys(STATUS_META) as StatusGestor[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {STATUS_META[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </GlassCard>

      <div className="mt-4 space-y-3">
        {loading ? (
          <GlassCard className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
            Carregando solicitações…
          </GlassCard>
        ) : filtered.length === 0 ? (
          <GlassCard className="p-8 text-center text-sm text-muted-foreground">
            <Package className="mx-auto mb-2 h-6 w-6" />
            {pecas.length === 0
              ? "Nenhuma solicitação de peça ainda."
              : "Nenhuma solicitação encontrada com esses filtros."}
          </GlassCard>
        ) : (
          filtered.map((p) => {
            const os = osById.get(p.os_id);
            const meta = STATUS_META[p.status_gestor];
            const Icon = meta.icon;
            const stageIdx = STAGES.indexOf(p.status_gestor);
            const rejected = p.status_gestor === "rejeitado";
            return (
              <GlassCard key={p.id} className="overflow-hidden p-0">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">
                        OS {os?.numero_os ?? "?"}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${urgencyBadge(p.urgencia)}`}
                      >
                        {p.urgencia}
                      </Badge>
                      {os?.equipe && (
                        <Badge variant="secondary" className="text-[10px]">
                          {os.equipe}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 text-base font-medium">{p.descricao}</div>
                    <div className="text-xs text-muted-foreground">
                      Qtd {p.quantidade}
                      {os?.nome_os ? ` · ${os.nome_os}` : ""}
                      {[os?.predio, os?.andar, os?.local]
                        .filter(Boolean)
                        .join(" · ")
                        ? ` · ${[os?.predio, os?.andar, os?.local]
                            .filter(Boolean)
                            .join(" · ")}`
                        : ""}
                    </div>
                    {p.observacao && (
                      <div className="mt-2 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                        “{p.observacao}”
                      </div>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={`shrink-0 gap-1 px-1.5 py-0.5 text-[10px] sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-xs ${meta.badge}`}
                  >
                    <Icon
                      className={`h-3 w-3 sm:h-3.5 sm:w-3.5 ${
                        p.status_gestor === "em_analise" ? "animate-spin" : ""
                      }`}
                    />
                    <span>{meta.label}</span>
                  </Badge>

                </div>

                <div className="p-4">
                  {rejected ? (
                    <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
                      <AlertTriangle className="h-4 w-4" />
                      Solicitação rejeitada pelo gestor.
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 sm:gap-2">
                      {STAGES.map((s, i) => {
                        const done = i <= stageIdx;
                        const active = i === stageIdx;
                        const m = STATUS_META[s];
                        return (
                          <div
                            key={s}
                            className="flex flex-1 items-center gap-1 sm:gap-2"
                          >
                            <div className="flex min-w-0 flex-col items-center gap-1">
                              <div
                                className={`flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-semibold transition sm:h-7 sm:w-7 sm:text-[11px] ${
                                  done
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-muted text-muted-foreground"
                                } ${active ? "ring-2 ring-primary/40" : ""}`}
                              >
                                {i + 1}
                              </div>
                              <span
                                className={`whitespace-nowrap text-[8px] uppercase tracking-wider sm:text-[10px] ${
                                  done ? "text-foreground" : "text-muted-foreground"
                                }`}
                              >
                                {m.label}
                              </span>
                            </div>

                            {i < STAGES.length - 1 && (
                              <div
                                className={`h-0.5 flex-1 rounded-full transition ${
                                  i < stageIdx ? "bg-primary" : "bg-border"
                                }`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>Enviada {timeAgo(p.created_at)}</span>
                    <span>Atualizada {timeAgo(p.updated_at)}</span>
                  </div>
                </div>
              </GlassCard>
            );
          })
        )}
      </div>
    </PageShell>
  );
}
