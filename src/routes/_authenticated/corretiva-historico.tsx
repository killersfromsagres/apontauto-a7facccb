import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Camera,
  Package,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  Download,
  ExternalLink,
  Link as LinkIcon,
  PenLine,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  loadEquipe,
  saveEquipe,
  matchEquipe,
  equipeStyles,
  type EquipeFiltro,
} from "@/lib/corretiva/equipe";
import { OsPhotosButton } from "@/components/refrigeracao/os-photos-button";

export const Route = createFileRoute("/_authenticated/corretiva-historico")({
  component: HistoricoPage,
});

type OsRow = {
  id: string;
  numero_os: string;
  nome_os: string | null;
  predio: string | null;
  andar: string | null;
  local: string | null;
  ativo: string;
  equipamento: string;
  equipe: string | null;
  patrimonio: string | null;
  assinatura_url: string | null;
  assinatura_nome: string | null;
  assinatura_em: string | null;
  status: string;
  fim: string | null;
  updated_at: string;
};
type Foto = {
  id: string;
  storage_path: string | null;
  image_url: string | null;
  created_at: string;
  legenda: string | null;
};
type Peca = {
  id: string;
  descricao: string;
  quantidade: number;
  urgencia: string;
  observacao: string | null;
  modelo: string | null;
  created_at: string;
};
type Problema = { id: string; descricao: string; gravidade: string; created_at: string };

function HistoricoPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<OsRow | null>(null);
  const [equipe, setEquipe] = useState<EquipeFiltro>("todas");
  const [equipes, setEquipes] = useState<string[]>([]);

  useEffect(() => {
    setEquipe(loadEquipe());
    supabase
      .from("corretiva_equipes")
      .select("nome")
      .order("nome")
      .then(({ data }) => setEquipes((data ?? []).map((r: any) => r.nome as string)));
  }, []);

  const setEquipeAndPersist = (v: EquipeFiltro) => {
    setEquipe(v);
    saveEquipe(v);
  };

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["corretiva-historico"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("corretiva_os")
        .select(
          "id, numero_os, nome_os, predio, andar, local, ativo, equipamento, equipe, patrimonio, assinatura_url, assinatura_nome, assinatura_em, status, fim, updated_at",
        )
        .in("status", ["concluida", "cancelada"])
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as OsRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((o) => {
      if (!matchEquipe(o.equipe, equipe)) return false;
      if (!q) return true;
      return [o.numero_os, o.nome_os, o.ativo, o.equipamento, o.predio, o.local]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [rows, search, equipe]);

  return (
    <PageShell
      title="Histórico de OS — Corretiva"
      description="Ordens de serviço concluídas e canceladas."
    >
      <GlassCard className="p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 sm:min-w-[240px]">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Minha equipe
            </span>
            <Select value={equipe} onValueChange={(v) => setEquipeAndPersist(v as EquipeFiltro)}>
              <SelectTrigger className="h-11 flex-1 text-base sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as equipes</SelectItem>
                {equipes.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-1 items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar OS, ativo, equipamento…"
              className="h-11 text-base"
            />
          </div>
        </div>
        {equipe !== "todas" && (
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="text-[10px]">
              {equipe}
            </Badge>
            <span>Mostrando apenas OS desta equipe.</span>
            <button
              type="button"
              onClick={() => setEquipeAndPersist("todas")}
              className="ml-auto text-primary underline-offset-2 hover:underline"
            >
              Ver todas
            </button>
          </div>
        )}
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
            Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma OS encontrada.
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {filtered.map((o) => {
              const cancelada = o.status === "cancelada";
              const Icon = cancelada ? XCircle : CheckCircle2;
              const st = equipeStyles(o.equipe);
              const rowCls = cancelada
                ? "border-l-4 border-destructive/60 hover:bg-accent/60"
                : "border-l-4 border-emerald-500 bg-emerald-50/70 hover:bg-emerald-100/70 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20";
              return (
                <li key={o.id}>
                  <div
                    className={`flex w-full items-start gap-3 rounded-md px-2 py-3 text-left transition ${rowCls}`}
                  >
                    <button
                      type="button"
                      onClick={() => setOpen(o)}
                      className="flex flex-1 items-start gap-3 text-left"
                    >
                      <Icon
                        className={`mt-0.5 h-5 w-5 shrink-0 ${
                          cancelada ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`font-mono text-sm font-semibold ${cancelada ? "" : "text-emerald-800 dark:text-emerald-300"}`}
                          >
                            OS {o.numero_os}
                          </span>
                          {cancelada ? (
                            <Badge variant="secondary" className="text-[10px]">
                              cancelada
                            </Badge>
                          ) : (
                            <Badge className="border border-emerald-500/40 bg-emerald-500/20 text-[10px] text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300">
                              <CheckCircle2 className="mr-1 h-3 w-3" /> Finalizada
                            </Badge>
                          )}
                          {o.equipe && (
                            <Badge variant="outline" className={`text-[10px] ${st.badge}`}>
                              <span
                                className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${st.dot}`}
                              />
                              {o.equipe}
                            </Badge>
                          )}
                          {o.assinatura_url && (
                            <Badge variant="outline" className="text-[10px]">
                              <PenLine className="mr-1 h-3 w-3" /> Rubricada
                            </Badge>
                          )}
                          {o.fim && !cancelada && (
                            <span className="text-xs text-muted-foreground">
                              concluída em {new Date(o.fim).toLocaleString("pt-BR")}
                            </span>
                          )}
                        </div>
                        {o.nome_os ? (
                          <div className="mt-1 max-h-24 overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-white/5 p-2 text-sm font-medium leading-snug whitespace-pre-wrap break-words sm:max-h-28">
                            {o.nome_os}
                          </div>
                        ) : (
                          <div className="mt-1 text-sm text-muted-foreground">
                            Sem descrição da atividade
                          </div>
                        )}
                        <div className="mt-1 break-words text-xs text-muted-foreground/80">
                          {[o.predio, o.andar, o.local].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                    </button>
                    <div className="shrink-0 self-center">
                      <OsPhotosButton osId={o.id} numeroOs={o.numero_os} modulo="corretiva" />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>

      <OsDetail os={open} onClose={() => setOpen(null)} />
    </PageShell>
  );
}

function OsDetail({ os, onClose }: { os: OsRow | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["corretiva-historico-detail", os?.id],
    enabled: !!os,
    queryFn: async () => {
      if (!os) return { fotos: [] as Foto[], pecas: [] as Peca[], problemas: [] as Problema[] };
      const [f, p, pr] = await Promise.all([
        supabase
          .from("corretiva_fotos")
          .select("id, storage_path, image_url, created_at, legenda")
          .eq("os_id", os.id)
          .order("created_at"),
        supabase
          .from("corretiva_pecas")
          .select("id, descricao, modelo, quantidade, urgencia, observacao, created_at")
          .eq("os_id", os.id)
          .order("created_at"),
        supabase
          .from("corretiva_problemas")
          .select("id, descricao, gravidade, created_at")
          .eq("os_id", os.id)
          .order("created_at"),
      ]);
      return {
        fotos: (f.data ?? []) as Foto[],
        pecas: (p.data ?? []) as Peca[],
        problemas: (pr.data ?? []) as Problema[],
      };
    },
  });

  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    (async () => {
      if (!data?.fotos?.length) return;
      const next: Record<string, string> = {};
      const legacy: Foto[] = [];
      for (const f of data.fotos) {
        if (f.image_url) next[f.id] = f.image_url;
        else if (f.storage_path) legacy.push(f);
      }
      if (legacy.length) {
        const paths = legacy.map((f) => f.storage_path as string);
        const { data: s } = await supabase.storage
          .from("corretiva-fotos")
          .createSignedUrls(paths, 3600);
        legacy.forEach((f, i) => {
          const u = s?.[i]?.signedUrl;
          if (u) next[f.id] = u;
        });
      }
      setUrls(next);
    })();
  }, [data]);

  const downloadPhoto = async (f: Foto, idx: number) => {
    const url = urls[f.id];
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `OS-${os?.numero_os ?? "foto"}-${idx + 1}.jpg`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank", "noopener");
    }
  };

  return (
    <Dialog open={!!os} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[90vh] overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">OS {os?.numero_os}</DialogTitle>
        </DialogHeader>
        {os?.nome_os && (
          <div className="max-h-40 overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-white/5 p-3 text-sm leading-snug whitespace-pre-wrap break-words">
            {os.nome_os}
          </div>
        )}

        {isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Carregando…
          </div>
        ) : (
          <div className="space-y-4">
            <section>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Camera className="h-4 w-4" /> Fotos ({data?.fotos.length ?? 0})
              </h4>
              {data?.fotos.length ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {data.fotos.map((f, idx) => (
                      <a
                        key={f.id}
                        href={urls[f.id] ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => {
                          if (!urls[f.id]) e.preventDefault();
                        }}
                        className="group relative block aspect-square overflow-hidden rounded-2xl border border-white/10 bg-black/5 shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-95 dark:bg-white/5"
                      >
                        {urls[f.id] ? (
                          <img
                            src={urls[f.id]}
                            className="h-full w-full object-cover"
                            alt=""
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                            …
                          </div>
                        )}
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <ExternalLink className="h-3.5 w-3.5 text-white" />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              downloadPhoto(f, idx);
                            }}
                            className="pointer-events-auto rounded-full bg-white/20 p-1 text-white backdrop-blur-md transition hover:bg-white/30"
                            aria-label="Baixar foto"
                          >
                            <Download className="h-3 w-3" />
                          </button>
                        </div>
                      </a>
                    ))}
                  </div>
                  {data.fotos.some((f) => f.image_url) && (
                    <ul className="space-y-1.5">
                      {data.fotos
                        .filter((f) => f.image_url)
                        .map((f, i) => (
                          <li key={`link-${f.id}`}>
                            <a
                              href={f.image_url as string}
                              target="_blank"
                              rel="noreferrer"
                              className="group flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs backdrop-blur-xl transition-all duration-200 hover:border-primary/40 hover:bg-white/10 active:scale-[0.98]"
                            >
                              <LinkIcon className="h-3.5 w-3.5 text-primary" />
                              <span className="truncate font-mono text-muted-foreground">
                                Foto {i + 1} · {f.image_url}
                              </span>
                              <ExternalLink className="ml-auto h-3.5 w-3.5 opacity-60 transition group-hover:opacity-100" />
                            </a>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhuma foto.</p>
              )}
            </section>

            <section>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Package className="h-4 w-4" /> Peças solicitadas ({data?.pecas.length ?? 0})
              </h4>
              {data?.pecas.length ? (
                <ul className="space-y-2">
                  {data.pecas.map((p) => (
                    <li key={p.id} className="rounded-md border bg-background/40 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{p.descricao}</span>
                        {p.modelo && (
                          <Badge variant="outline" className="text-[10px]">
                            {p.modelo}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          Qtd {p.quantidade}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {p.urgencia}
                        </Badge>
                      </div>
                      {p.observacao && (
                        <p className="mt-1 text-xs text-muted-foreground">{p.observacao}</p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Sem pedidos.</p>
              )}
            </section>

            {os?.assinatura_url && (
              <section>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  <PenLine className="h-4 w-4" /> Rubrica do solicitante
                </h4>
                <div className="rounded-2xl border border-white/10 bg-white p-3">
                  <img loading="lazy" decoding="async" src={os.assinatura_url} alt="Rubrica do solicitante" className="max-h-32" />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {os.assinatura_nome ? `${os.assinatura_nome} · ` : ""}
                  {os.assinatura_em ? new Date(os.assinatura_em).toLocaleString("pt-BR") : ""}
                </p>
              </section>
            )}

            <section>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <AlertTriangle className="h-4 w-4" /> Problemas ({data?.problemas.length ?? 0})
              </h4>
              {data?.problemas.length ? (
                <ul className="space-y-2">
                  {data.problemas.map((pr) => (
                    <li key={pr.id} className="rounded-md border bg-background/40 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {pr.gravidade}
                        </Badge>
                      </div>
                      <p className="mt-1">{pr.descricao}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhum problema.</p>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
