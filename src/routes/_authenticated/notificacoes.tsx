import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BellRing,
  CheckCheck,
  Inbox,
  Megaphone,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, KpiCard, StatusBadge } from "@/components/pcm";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { supabase } from "@/integrations/supabase/client";
import { allMenuItems } from "@/lib/nav-config";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notificacoes")({
  head: () => ({
    meta: [
      { title: "Central de Notificações | Apont Auto PCM" },
      {
        name: "description",
        content:
          "Avisos operacionais do PCM por módulo e por pessoa: alertas críticos, comunicados de equipe e controle de leitura.",
      },
      { property: "og:title", content: "Central de Notificações | Apont Auto PCM" },
      {
        property: "og:description",
        content: "Avisos operacionais por módulo, com gravidade e controle de leitura.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificacoesPage,
});

type Notificacao = {
  id: string;
  title: string;
  body: string | null;
  module_key: string | null;
  severity: string;
  link_url: string | null;
  target_user_id: string | null;
  created_at: string;
  expires_at: string | null;
};

const SEVERIDADES = [
  { key: "info", label: "Informativo", tone: "primary" as const },
  { key: "warn", label: "Atenção", tone: "warning" as const },
  { key: "critical", label: "Crítico", tone: "danger" as const },
];

const sevMeta = (key: string) =>
  SEVERIDADES.find((s) => s.key === key) ?? SEVERIDADES[0];

const moduleLabel = (key: string | null) =>
  key ? (allMenuItems.find((i) => i.key === key)?.title ?? key) : "Todos os módulos";

const fmtData = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function NotificacoesPage() {
  const qc = useQueryClient();
  const { allowed: podeEmitir } = useCanAccessModule("notificacoes-admin", "read");
  const [filtro, setFiltro] = useState<"nao-lidas" | "todas">("nao-lidas");

  const sessao = useQuery({
    queryKey: ["auth-user-id"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  const avisos = useQuery({
    queryKey: ["notificacoes"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select(
          "id, title, body, module_key, severity, link_url, target_user_id, created_at, expires_at",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as Notificacao[];
    },
  });

  const leituras = useQuery({
    queryKey: ["notificacoes-leituras"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_reads")
        .select("notification_id");
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.notification_id as string));
    },
  });

  const marcarLido = useMutation({
    mutationFn: async (ids: string[]) => {
      const userId = sessao.data;
      if (!userId || ids.length === 0) return;
      const { error } = await supabase
        .from("notification_reads")
        .upsert(
          ids.map((id) => ({ notification_id: id, user_id: userId })),
          { onConflict: "notification_id,user_id", ignoreDuplicates: true },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificacoes-leituras"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aviso removido.");
      qc.invalidateQueries({ queryKey: ["notificacoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const agora = Date.now();
  const vigentes = useMemo(
    () =>
      (avisos.data ?? []).filter(
        (n) => !n.expires_at || new Date(n.expires_at).getTime() > agora,
      ),
    [avisos.data, agora],
  );

  const lidos = leituras.data ?? new Set<string>();
  const naoLidos = vigentes.filter((n) => !lidos.has(n.id));
  const lista = filtro === "nao-lidas" ? naoLidos : vigentes;
  const criticos = naoLidos.filter((n) => n.severity === "critical").length;

  if (avisos.error) {
    return (
      <PageShell
        eyebrow="Comunicação"
        title="Central de Notificações"
        description="Avisos operacionais por módulo e por pessoa."
      >
        <GlassCard variant="block" className="p-6">
          <ErrorState
            title="Não foi possível carregar os avisos"
            description={(avisos.error as Error).message}
            onRetry={() => avisos.refetch()}
          />
        </GlassCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Comunicação"
      title="Central de Notificações"
      description="Avisos operacionais direcionados por módulo ou por pessoa, com gravidade e controle de leitura."
    >
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard icon={<Inbox className="size-4" />} label="Vigentes" value={String(vigentes.length)} />
        <KpiCard icon={<BellRing className="size-4" />} label="Não lidos" value={String(naoLidos.length)} />
        <KpiCard icon={<AlertTriangle className="size-4" />} label="Críticos" value={String(criticos)} />
        <KpiCard
          icon={<CheckCheck className="size-4" />}
          label="Lidos"
          value={String(vigentes.length - naoLidos.length)}
        />
      </div>

      {podeEmitir ? <NovoAvisoForm onCriado={() => avisos.refetch()} /> : null}

      <GlassCard variant="block" className="mt-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            {(["nao-lidas", "todas"] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={filtro === k ? "default" : "outline"}
                className="h-11"
                onClick={() => setFiltro(k)}
              >
                {k === "nao-lidas" ? `Não lidos (${naoLidos.length})` : "Todos"}
              </Button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-11"
            disabled={naoLidos.length === 0 || marcarLido.isPending}
            onClick={() => marcarLido.mutate(naoLidos.map((n) => n.id))}
          >
            <CheckCheck className="mr-2 size-4" />
            Marcar tudo como lido
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {lista.length === 0 ? (
            <EmptyState
              icon={<Inbox className="size-6" />}
              title={filtro === "nao-lidas" ? "Nenhum aviso pendente" : "Nenhum aviso vigente"}
              description="Avisos criados para os seus módulos aparecem aqui automaticamente."
            />
          ) : (
            lista.map((n) => {
              const sev = sevMeta(n.severity);
              const lido = lidos.has(n.id);
              return (
                <article
                  key={n.id}
                  className={cn(
                    "rounded-2xl border border-border/60 bg-card/40 p-4 transition-colors",
                    !lido && "border-primary/40 bg-primary/[0.06]",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={sev.tone} status={sev.label} />
                        <span className="text-xs text-muted-foreground">
                          {moduleLabel(n.module_key)}
                        </span>
                        {n.target_user_id ? (
                          <span className="text-xs text-muted-foreground">· pessoal</span>
                        ) : null}
                      </div>
                      <h3 className="mt-2 font-semibold leading-snug">{n.title}</h3>
                      {n.body ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                          {n.body}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-muted-foreground">{fmtData(n.created_at)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {n.link_url ? (
                        <Button asChild size="sm" variant="ghost" className="h-11">
                          <a href={n.link_url}>Abrir</a>
                        </Button>
                      ) : null}
                      {!lido ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-11"
                          onClick={() => marcarLido.mutate([n.id])}
                        >
                          Marcar lido
                        </Button>
                      ) : null}
                      {podeEmitir ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-11"
                          aria-label="Excluir aviso"
                          onClick={() => excluir.mutate(n.id)}
                        >
                          <Trash2 className="size-4" />
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

function NovoAvisoForm({ onCriado }: { onCriado: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState("info");
  const [moduleKey, setModuleKey] = useState("__all__");

  const criar = useMutation({
    mutationFn: async () => {
      const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
      const { error } = await supabase.from("notifications").insert({
        title: title.trim(),
        body: body.trim() || null,
        severity,
        module_key: moduleKey === "__all__" ? null : moduleKey,
        created_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aviso publicado.");
      setTitle("");
      setBody("");
      onCriado();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <GlassCard variant="block" className="mt-4 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Megaphone className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Publicar aviso</h2>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="aviso-titulo">Título</Label>
          <Input
            id="aviso-titulo"
            value={title}
            maxLength={140}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Parada programada do sistema"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Gravidade</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERIDADES.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Destino</Label>
            <Select value={moduleKey} onValueChange={setModuleKey}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__all__">Todos os módulos</SelectItem>
                {allMenuItems.map((i) => (
                  <SelectItem key={i.key} value={i.key}>
                    {i.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="aviso-msg">Mensagem</Label>
          <Textarea
            id="aviso-msg"
            value={body}
            maxLength={1000}
            rows={3}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Detalhe o que a equipe precisa fazer."
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          className="h-11"
          disabled={title.trim().length < 3 || criar.isPending}
          onClick={() => criar.mutate()}
        >
          <Send className="mr-2 size-4" />
          Publicar
        </Button>
      </div>
    </GlassCard>
  );
}
