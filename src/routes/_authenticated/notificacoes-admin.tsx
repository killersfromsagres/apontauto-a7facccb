import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CheckCheck,
  Eye,
  Megaphone,
  Monitor,
  Pause,
  Play,
  Send,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import { listAppUsers } from "@/lib/users.functions";
import { allMenuItems } from "@/lib/nav-config";
import {
  CATEGORIES,
  STATUS_LABEL,
  STATUS_TONE,
  TARGET_MODES,
  categoryMeta,
  fetchAllNotifications,
  fmtDateTime,
  isoToLocal,
  localToIso,
  severityForCategory,
  type NotificationCategory,
  type NotificationRow,
  type NotificationStatus,
  type TargetMode,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notificacoes-admin")({
  head: () => ({
    meta: [
      { title: "Administração de Avisos | Apont Auto PCM" },
      {
        name: "description",
        content:
          "Crie, agende, publique e acompanhe avisos operacionais do PCM com métricas de entrega, leitura e confirmação de ciência.",
      },
      { property: "og:title", content: "Administração de Avisos | Apont Auto PCM" },
      {
        property: "og:description",
        content: "Composição, agendamento e métricas de avisos operacionais do PCM.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificacoesAdminPage,
});

type Rascunho = {
  id: string | null;
  title: string;
  body: string;
  category: NotificationCategory;
  targetMode: TargetMode;
  targets: string[];
  startsAt: string;
  expiresAt: string;
  deepLink: string;
  requiresAck: boolean;
};

const rascunhoVazio: Rascunho = {
  id: null,
  title: "",
  body: "",
  category: "informacao",
  targetMode: "all",
  targets: [],
  startsAt: "",
  expiresAt: "",
  deepLink: "",
  requiresAck: false,
};

function NotificacoesAdminPage() {
  const qc = useQueryClient();
  const { allowed, isLoading: checando } = useCanAccessModule("notificacoes-admin", "read");
  const [form, setForm] = useState<Rascunho>(rascunhoVazio);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");

  const avisos = useQuery({
    queryKey: ["notifications-admin"],
    queryFn: fetchAllNotifications,
    enabled: allowed,
    staleTime: 20_000,
  });

  const usuarios = useQuery({
    queryKey: ["notifications-admin-users"],
    enabled: allowed && form.targetMode === "users",
    staleTime: 5 * 60 * 1000,
    queryFn: async () => (await listAppUsers()).users,
  });

  const papeis = useQuery({
    queryKey: ["pcm-roles"],
    enabled: allowed && form.targetMode === "roles",
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("pcm_roles").select("key, label").order("rank");
      if (error) throw error;
      return data ?? [];
    },
  });

  const equipes = useQuery({
    queryKey: ["corretiva-equipes-nomes"],
    enabled: allowed && form.targetMode === "teams",
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("corretiva_equipes")
        .select("id, nome")
        .order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });

  const receipts = useQuery({
    queryKey: ["notification-receipts-metrics"],
    enabled: allowed,
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_receipts")
        .select("notification_id, read_at, acknowledged_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const metrics = useMemo(() => {
    const map = new Map<string, { delivered: number; read: number; acked: number }>();
    for (const r of receipts.data ?? []) {
      const cur = map.get(r.notification_id) ?? { delivered: 0, read: 0, acked: 0 };
      cur.delivered += 1;
      if (r.read_at) cur.read += 1;
      if (r.acknowledged_at) cur.acked += 1;
      map.set(r.notification_id, cur);
    }
    return map;
  }, [receipts.data]);

  const salvar = useMutation({
    mutationFn: async (status: NotificationStatus) => {
      const title = form.title.trim();
      if (title.length < 3) throw new Error("Informe um título com pelo menos 3 caracteres.");
      if (form.targetMode !== "all" && form.targets.length === 0)
        throw new Error("Selecione ao menos um destinatário para esse tipo de público.");
      const userId = (await supabase.auth.getUser()).data.user?.id ?? null;

      const payload = {
        title,
        body: form.body.trim() || null,
        category: form.category,
        severity: severityForCategory(form.category),
        target_mode: form.targetMode,
        deep_link: form.deepLink.trim() || null,
        link_url: form.deepLink.trim() || null,
        starts_at: localToIso(form.startsAt) ?? new Date().toISOString(),
        expires_at: localToIso(form.expiresAt),
        requires_ack: form.requiresAck,
        status,
        created_by: userId,
      };

      let id = form.id;
      if (id) {
        const { error } = await supabase.from("notifications").update(payload).eq("id", id);
        if (error) throw error;
        await supabase.from("notification_targets").delete().eq("notification_id", id);
      } else {
        const { data, error } = await supabase
          .from("notifications")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        id = data.id as string;
      }

      if (form.targetMode !== "all" && id) {
        const col =
          form.targetMode === "users"
            ? "user_id"
            : form.targetMode === "roles"
              ? "role_key"
              : form.targetMode === "modules"
                ? "module_key"
                : "team_key";
        const rows = form.targets.map((v) => ({
          notification_id: id as string,
          user_id: col === "user_id" ? v : null,
          role_key: col === "role_key" ? v : null,
          module_key: col === "module_key" ? v : null,
          team_key: col === "team_key" ? v : null,
        }));
        const { error } = await supabase.from("notification_targets").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: (_d, status) => {
      toast.success(
        status === "published"
          ? "Aviso publicado."
          : status === "scheduled"
            ? "Aviso agendado."
            : "Rascunho salvo.",
      );
      setForm(rascunhoVazio);
      qc.invalidateQueries({ queryKey: ["notifications-admin"] });
      qc.invalidateQueries({ queryKey: ["notifications-inbox"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mudarStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: NotificationStatus }) => {
      const { error } = await supabase.from("notifications").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications-admin"] });
      qc.invalidateQueries({ queryKey: ["notifications-inbox"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aviso removido.");
      qc.invalidateQueries({ queryKey: ["notifications-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editar = async (n: NotificationRow) => {
    const { data } = await supabase
      .from("notification_targets")
      .select("user_id, role_key, module_key, team_key")
      .eq("notification_id", n.id);
    const targets = (data ?? [])
      .map((t) => t.user_id ?? t.role_key ?? t.module_key ?? t.team_key)
      .filter(Boolean) as string[];
    setForm({
      id: n.id,
      title: n.title,
      body: n.body ?? "",
      category: n.category as NotificationCategory,
      targetMode: n.target_mode as TargetMode,
      targets,
      startsAt: isoToLocal(n.starts_at),
      expiresAt: isoToLocal(n.expires_at),
      deepLink: n.deep_link ?? n.link_url ?? "",
      requiresAck: n.requires_ack,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const opcoes: { value: string; label: string }[] = useMemo(() => {
    if (form.targetMode === "users")
      return (usuarios.data ?? []).map((u) => ({
        value: u.id,
        label: u.fullName ? `${u.login} — ${u.fullName}` : u.login,
      }));
    if (form.targetMode === "roles")
      return (papeis.data ?? []).map((r) => ({ value: r.key, label: r.label }));
    if (form.targetMode === "modules")
      return allMenuItems.map((i) => ({ value: i.key, label: i.title }));
    if (form.targetMode === "teams")
      return (equipes.data ?? []).map((e) => ({ value: e.nome, label: e.nome }));
    return [];
  }, [form.targetMode, usuarios.data, papeis.data, equipes.data]);

  if (!checando && !allowed) {
    return (
      <PageShell eyebrow="Comunicação" title="Administração de Avisos">
        <GlassCard variant="block" className="p-6">
          <EmptyState
            icon={<Megaphone className="size-6" />}
            title="Acesso restrito"
            description="Este painel exige a permissão de administração de notificações."
          />
        </GlassCard>
      </PageShell>
    );
  }

  const publicados = (avisos.data ?? []).filter((n) => n.status === "published");
  const agendados = (avisos.data ?? []).filter((n) => n.status === "scheduled");
  const totalAck = [...metrics.values()].reduce((a, m) => a + m.acked, 0);
  const totalRead = [...metrics.values()].reduce((a, m) => a + m.read, 0);

  return (
    <PageShell
      eyebrow="Comunicação"
      title="Administração de Avisos"
      description="Componha, agende e acompanhe os avisos enviados aos colaboradores, com métricas de entrega, leitura e ciência."
    >
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          icon={<Send className="size-4" />}
          label="Publicados"
          value={String(publicados.length)}
        />
        <KpiCard
          icon={<Play className="size-4" />}
          label="Agendados"
          value={String(agendados.length)}
        />
        <KpiCard icon={<Eye className="size-4" />} label="Leituras" value={String(totalRead)} />
        <KpiCard
          icon={<CheckCheck className="size-4" />}
          label="Ciências"
          value={String(totalAck)}
        />
      </div>

      <GlassCard variant="block" className="mt-4 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Megaphone className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">{form.id ? "Editar aviso" : "Novo aviso"}</h2>
          {form.id ? (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-9"
              onClick={() => setForm(rascunhoVazio)}
            >
              <X className="mr-1.5 size-3.5" /> Cancelar edição
            </Button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="aviso-titulo">Título</Label>
              <Input
                id="aviso-titulo"
                value={form.title}
                maxLength={140}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex.: Parada programada da subestação"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aviso-msg">Mensagem</Label>
              <Textarea
                id="aviso-msg"
                rows={4}
                value={form.body}
                maxLength={2000}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Detalhe o aviso, o impacto e a ação esperada."
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, category: v as NotificationCategory }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Público</Label>
                <Select
                  value={form.targetMode}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, targetMode: v as TargetMode, targets: [] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TARGET_MODES.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.targetMode !== "all" ? (
              <div className="space-y-1.5">
                <Label>Destinatários selecionados ({form.targets.length})</Label>
                <div className="max-h-52 overflow-auto rounded-xl border border-border/60 bg-background/50 p-2">
                  {opcoes.length === 0 ? (
                    <p className="p-2 text-xs text-muted-foreground">Carregando opções…</p>
                  ) : (
                    opcoes.map((o) => {
                      const checked = form.targets.includes(o.value);
                      return (
                        <label
                          key={o.value}
                          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(c) =>
                              setForm((f) => ({
                                ...f,
                                targets: c
                                  ? [...f.targets, o.value]
                                  : f.targets.filter((t) => t !== o.value),
                              }))
                            }
                          />
                          <span className="truncate text-sm">{o.label}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="aviso-inicio">Data de início</Label>
                <Input
                  id="aviso-inicio"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aviso-exp">Data de expiração</Label>
                <Input
                  id="aviso-exp"
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="aviso-link">Link interno (opcional)</Label>
              <Input
                id="aviso-link"
                value={form.deepLink}
                onChange={(e) => setForm((f) => ({ ...f, deepLink: e.target.value }))}
                placeholder="/corretiva"
              />
            </div>

            <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/50 px-3">
              <span className="text-sm">Exigir confirmação de leitura</span>
              <Switch
                checked={form.requiresAck}
                onCheckedChange={(c) => setForm((f) => ({ ...f, requiresAck: c }))}
              />
            </label>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                className="h-11"
                loading={salvar.isPending}
                onClick={() => salvar.mutate("published")}
              >
                <Send className="mr-2 size-4" />
                Publicar
              </Button>
              <Button
                variant="outline"
                className="h-11"
                loading={salvar.isPending}
                onClick={() => salvar.mutate("scheduled")}
              >
                <Play className="mr-2 size-4" />
                Agendar
              </Button>
              <Button
                variant="ghost"
                className="h-11"
                loading={salvar.isPending}
                onClick={() => salvar.mutate("draft")}
              >
                Salvar rascunho
              </Button>
            </div>
          </div>

          {/* Prévia */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Prévia
              </span>
              <div className="ml-auto flex gap-1">
                <Button
                  size="icon"
                  variant={previewDevice === "desktop" ? "default" : "outline"}
                  className="size-9"
                  aria-label="Prévia desktop"
                  onClick={() => setPreviewDevice("desktop")}
                >
                  <Monitor className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant={previewDevice === "mobile" ? "default" : "outline"}
                  className="size-9"
                  aria-label="Prévia mobile"
                  onClick={() => setPreviewDevice("mobile")}
                >
                  <Smartphone className="size-4" />
                </Button>
              </div>
            </div>
            <div
              className={cn(
                "mx-auto rounded-2xl border border-border/60 bg-background/60 p-4",
                previewDevice === "mobile" ? "max-w-[20rem]" : "w-full",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  tone={categoryMeta(form.category).tone}
                  status={categoryMeta(form.category).label}
                />
                {form.requiresAck ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-destructive">
                    exige ciência
                  </span>
                ) : null}
              </div>
              <p className="mt-2 font-semibold leading-snug">{form.title || "Título do aviso"}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {form.body || "A mensagem enviada aparece assim para o colaborador."}
              </p>
              {form.deepLink ? (
                <p className="mt-2 text-xs text-primary">Abrir {form.deepLink}</p>
              ) : null}
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard variant="block" className="mt-4 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Avisos e métricas</h2>
        </div>

        {avisos.error ? (
          <ErrorState
            title="Não foi possível carregar os avisos"
            description={(avisos.error as Error).message}
            onRetry={() => avisos.refetch()}
          />
        ) : (avisos.data ?? []).length === 0 ? (
          <EmptyState
            icon={<Megaphone className="size-6" />}
            title="Nenhum aviso criado"
            description="Use o formulário acima para publicar o primeiro comunicado."
          />
        ) : (
          <div className="mt-3 space-y-3">
            {(avisos.data ?? []).map((n) => {
              const m = metrics.get(n.id) ?? { delivered: 0, read: 0, acked: 0 };
              const st = (n.status as NotificationStatus) ?? "published";
              return (
                <article key={n.id} className="rounded-2xl border border-border/60 bg-card/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          tone={categoryMeta(n.category).tone}
                          status={categoryMeta(n.category).label}
                        />
                        <StatusBadge tone={STATUS_TONE[st]} status={STATUS_LABEL[st]} />
                        <span className="text-xs text-muted-foreground">
                          {TARGET_MODES.find((t) => t.key === n.target_mode)?.label ??
                            n.target_mode}
                        </span>
                      </div>
                      <h3 className="mt-2 font-semibold leading-snug">{n.title}</h3>
                      {n.body ? (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{n.body}</p>
                      ) : null}
                      <p className="mt-2 text-xs text-muted-foreground">
                        Início {fmtDateTime(n.starts_at)} · Expira {fmtDateTime(n.expires_at)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Entregue {m.delivered} · Lido {m.read}
                        {n.requires_ack ? ` · Confirmado ${m.acked}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-11" onClick={() => editar(n)}>
                        Editar
                      </Button>
                      {st === "published" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-11"
                          onClick={() => mudarStatus.mutate({ id: n.id, status: "paused" })}
                        >
                          <Pause className="mr-1.5 size-3.5" /> Pausar
                        </Button>
                      ) : st !== "cancelled" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-11"
                          onClick={() => mudarStatus.mutate({ id: n.id, status: "published" })}
                        >
                          <Play className="mr-1.5 size-3.5" /> Publicar
                        </Button>
                      ) : null}
                      {st !== "cancelled" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-11"
                          onClick={() => mudarStatus.mutate({ id: n.id, status: "cancelled" })}
                        >
                          Cancelar
                        </Button>
                      ) : null}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-11"
                        aria-label="Excluir aviso"
                        onClick={() => excluir.mutate(n.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </GlassCard>
    </PageShell>
  );
}
