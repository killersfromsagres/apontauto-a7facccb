import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, FileClock, ShieldAlert, ShieldCheck, Users } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DataTable,
  KpiCard,
  EmptyState,
  ErrorState,
  StatusBadge,
  DetailDrawer,
  DetailRow,
  type DataTableColumn,
} from "@/components/pcm";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/auditoria")({
  head: () => ({
    meta: [
      { title: "Trilha de Auditoria | Apont Auto PCM" },
      {
        name: "description",
        content:
          "Trilha de auditoria do PCM: quem alterou cada ordem de serviço, permissão e registro operacional, com dados antes e depois.",
      },
      { property: "og:title", content: "Trilha de Auditoria | Apont Auto PCM" },
      {
        property: "og:description",
        content: "Histórico imutável de alterações por usuário, módulo e entidade.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditoriaPage,
});

type AuditRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  module_key: string | null;
  action: string | null;
  old_data: unknown;
  new_data: unknown;
  metadata: unknown;
};

const PERIODOS = [
  { key: "24h", label: "24 horas", hours: 24 },
  { key: "7d", label: "7 dias", hours: 24 * 7 },
  { key: "30d", label: "30 dias", hours: 24 * 30 },
  { key: "tudo", label: "Tudo", hours: 0 },
] as const;

const actionTone = (action: string | null) => {
  switch ((action ?? "").toLowerCase()) {
    case "insert":
    case "create":
      return "success" as const;
    case "delete":
      return "danger" as const;
    case "update":
      return "primary" as const;
    default:
      return "neutral" as const;
  }
};

const actionLabel = (action: string | null) => {
  switch ((action ?? "").toLowerCase()) {
    case "insert":
    case "create":
      return "Criação";
    case "update":
      return "Alteração";
    case "delete":
      return "Exclusão";
    default:
      return action ?? "Evento";
  }
};

const fmt = (v: unknown) => {
  if (v == null) return "—";
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
};

const ORIGENS: Record<string, string> = {
  web: "Web",
  mobile: "Mobile",
  offline: "Sincronização offline",
  cron: "Rotina automática",
  integracao: "Integração",
};

const originOf = (r: AuditRow) => {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  const key = typeof meta.origin === "string" ? meta.origin : "web";
  return ORIGENS[key] ?? key;
};

/** Diferenças campo a campo entre o antes e o depois (dados já mascarados no banco). */
function diffFields(oldData: unknown, newData: unknown) {
  const a = (oldData ?? {}) as Record<string, unknown>;
  const b = (newData ?? {}) as Record<string, unknown>;
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
  const str = (v: unknown) => (v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return keys
    .map((k) => ({ key: k, before: str(a[k]), after: str(b[k]) }))
    .filter((d) => d.before !== d.after);
}

function toCsv(rows: AuditRow[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Data", "Ação", "Módulo", "Registro", "ID", "Usuário", "Origem"].join(";");
  const body = rows.map((r) =>
    [
      new Date(r.created_at).toLocaleString("pt-BR"),
      actionLabel(r.action),
      r.module_key ?? "",
      r.entity_type,
      r.entity_id ?? "",
      r.user_id ?? "sistema",
      originOf(r),
    ]
      .map(esc)
      .join(";"),
  );
  return `\uFEFF${[head, ...body].join("\n")}`;
}


function AuditoriaPage() {
  const { allowed, isLoading: loadingAccess } = useCanAccessModule("auditoria", "read");
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]["key"]>("7d");
  const [busca, setBusca] = useState("");
  const [modulo, setModulo] = useState("todos");
  const [acao, setAcao] = useState("todas");
  const [selecionado, setSelecionado] = useState<AuditRow | null>(null);


  const eventos = useQuery({
    queryKey: ["audit-events", periodo],
    enabled: allowed,
    staleTime: 30_000,
    queryFn: async () => {
      const cfg = PERIODOS.find((p) => p.key === periodo)!;
      let q = supabase
        .from("audit_events")
        .select(
          "id, created_at, user_id, event_type, entity_type, entity_id, module_key, action, old_data, new_data, metadata",
        )
        .order("created_at", { ascending: false })
        .limit(1000);
      if (cfg.hours > 0) {
        q = q.gte("created_at", new Date(Date.now() - cfg.hours * 3600_000).toISOString());
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const modulos = useMemo(
    () =>
      Array.from(new Set((eventos.data ?? []).map((r) => r.module_key ?? r.entity_type))).sort(),
    [eventos.data],
  );

  const rows = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    let base = eventos.data ?? [];
    if (modulo !== "todos") base = base.filter((r) => (r.module_key ?? r.entity_type) === modulo);
    if (acao !== "todas") base = base.filter((r) => (r.action ?? "").toLowerCase() === acao);
    if (!termo) return base;
    return base.filter((r) =>
      [r.entity_type, r.module_key, r.action, r.event_type, r.entity_id, r.user_id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(termo)),
    );
  }, [eventos.data, busca, modulo, acao]);

  function baixarCsv() {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }


  const kpis = useMemo(() => {
    const total = rows.length;
    const usuarios = new Set(rows.map((r) => r.user_id).filter(Boolean)).size;
    const exclusoes = rows.filter((r) => (r.action ?? "").toLowerCase() === "delete").length;
    const modulos = new Set(rows.map((r) => r.module_key ?? r.entity_type)).size;
    return { total, usuarios, exclusoes, modulos };
  }, [rows]);

  const columns: DataTableColumn<AuditRow>[] = [
    {
      key: "quando",
      header: "Quando",
      mobilePrimary: true,
      sortValue: (r) => r.created_at,
      cell: (r) =>
        new Date(r.created_at).toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        }),
      headClassName: "whitespace-nowrap min-w-[136px]",
    },
    {
      key: "acao",
      header: "Ação",
      sortValue: (r) => r.action ?? "",
      cell: (r) => <StatusBadge tone={actionTone(r.action)} status={actionLabel(r.action)} />,
      headClassName: "whitespace-nowrap",
    },
    {
      key: "entidade",
      header: "Registro",
      sortValue: (r) => r.entity_type,
      cell: (r) => (
        <span className="font-medium">
          {r.entity_type}
          {r.entity_id ? (
            <span className="text-muted-foreground"> · {r.entity_id.slice(0, 8)}</span>
          ) : null}
        </span>
      ),
      headClassName: "min-w-[160px]",
    },
    {
      key: "modulo",
      header: "Módulo",
      mobileHidden: true,
      sortValue: (r) => r.module_key ?? "",
      cell: (r) => r.module_key ?? "—",
    },
    {
      key: "usuario",
      header: "Usuário",
      mobileHidden: true,
      sortValue: (r) => r.user_id ?? "",
      cell: (r) => (r.user_id ? `${r.user_id.slice(0, 8)}…` : "sistema"),
    },
    {
      key: "detalhe",
      header: "",
      cell: (r) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-11"
          onClick={() => setSelecionado(r)}
        >
          Detalhes
        </Button>
      ),
    },
  ];

  if (!loadingAccess && !allowed) {
    return (
      <PageShell
        eyebrow="Segurança e Conformidade"
        title="Acesso restrito"
        description="A trilha de auditoria é visível apenas para auditor, proprietário e administrador."
      >
        <GlassCard variant="block" className="p-6">
          <EmptyState
            icon={<ShieldAlert className="size-6" />}
            title="Você não tem permissão para ver a auditoria"
            description="Peça ao administrador o papel Auditor. Registros de auditoria não podem ser alterados nem apagados por usuários comuns."
          />
        </GlassCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Segurança e Conformidade"
      title="Trilha de Auditoria"
      description="Histórico imutável de criações, alterações e exclusões, com os dados antes e depois de cada evento."
    >
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard icon={<Activity className="size-4" />} label="Eventos" value={String(kpis.total)} />
        <KpiCard icon={<Users className="size-4" />} label="Usuários" value={String(kpis.usuarios)} />
        <KpiCard
          icon={<FileClock className="size-4" />}
          label="Módulos"
          value={String(kpis.modulos)}
        />
        <KpiCard
          icon={<ShieldCheck className="size-4" />}
          label="Exclusões"
          value={String(kpis.exclusoes)}
        />
      </div>

      <GlassCard variant="block" className="mt-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {PERIODOS.map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant={periodo === p.key ? "default" : "outline"}
                className="h-11 shrink-0"
                onClick={() => setPeriodo(p.key)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por registro, módulo ou ação"
              className="h-11 sm:max-w-xs"
            />
            <select
              value={modulo}
              onChange={(e) => setModulo(e.target.value)}
              className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
              aria-label="Filtrar por módulo"
            >
              <option value="todos">Todos os módulos</option>
              {modulos.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={acao}
              onChange={(e) => setAcao(e.target.value)}
              className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
              aria-label="Filtrar por ação"
            >
              <option value="todas">Todas as ações</option>
              <option value="create">Criação</option>
              <option value="update">Alteração</option>
              <option value="delete">Exclusão</option>
            </select>
            <Button variant="outline" className="h-11 shrink-0" onClick={baixarCsv}>
              Exportar CSV
            </Button>
          </div>
        </div>


        <div className="mt-4">
          {eventos.isError ? (
            <ErrorState
              title="Não foi possível carregar a auditoria"
              description="Verifique sua conexão e tente novamente."
            />
          ) : (
            <DataTable
              data={rows}
              columns={columns}
              rowKey={(r) => r.id}
              loading={eventos.isLoading}
              emptyTitle="Nenhum evento no período"
              emptyDescription="Altere o período ou limpe a busca para ver mais registros."
              onRowClick={(r) => setSelecionado(r)}
            />
          )}
        </div>
      </GlassCard>

      <DetailDrawer
        open={!!selecionado}
        onOpenChange={(v) => !v && setSelecionado(null)}
        title={selecionado ? `${actionLabel(selecionado.action)} · ${selecionado.entity_type}` : ""}
        description={
          selecionado
            ? new Date(selecionado.created_at).toLocaleString("pt-BR", {
                dateStyle: "full",
                timeStyle: "medium",
              })
            : undefined
        }
      >
        {selecionado ? (
          <div className="space-y-3">
            <DetailRow label="Evento">{selecionado.event_type}</DetailRow>
            <DetailRow label="Módulo">{selecionado.module_key ?? "—"}</DetailRow>
            <DetailRow label="Registro">{selecionado.entity_id ?? "—"}</DetailRow>
            <DetailRow label="Usuário">{selecionado.user_id ?? "sistema"}</DetailRow>
            <DetailRow label="Origem">{originOf(selecionado)}</DetailRow>

            {selecionado.action === "update" ? (
              <div className="overflow-hidden rounded-2xl border border-border/60">
                <div className="grid grid-cols-3 gap-2 bg-muted/40 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                  <span>Campo</span>
                  <span>Antes</span>
                  <span>Depois</span>
                </div>
                {diffFields(selecionado.old_data, selecionado.new_data).map((d) => (
                  <div key={d.key} className="grid grid-cols-3 gap-2 border-t border-border/40 px-3 py-2 text-[11px]">
                    <span className="font-medium break-words">{d.key}</span>
                    <span className="break-words text-muted-foreground">{d.before}</span>
                    <span className="break-words">{d.after}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid gap-3 lg:grid-cols-2">

              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Antes</p>
                <pre className="max-h-64 overflow-auto rounded-2xl bg-muted/40 p-3 text-[11px] leading-relaxed">
                  {fmt(selecionado.old_data)}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Depois</p>
                <pre className="max-h-64 overflow-auto rounded-2xl bg-muted/40 p-3 text-[11px] leading-relaxed">
                  {fmt(selecionado.new_data)}
                </pre>
              </div>
            </div>
          </div>
        ) : null}
      </DetailDrawer>
    </PageShell>
  );
}
