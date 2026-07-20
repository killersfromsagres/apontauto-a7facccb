import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Camera, Package, AlertTriangle, Loader2, CheckCircle2, Download } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EQUIPES_REFRIGERACAO,
  loadEquipe,
  saveEquipe,
  matchEquipe,
  type EquipeFiltro,
} from "@/lib/refrigeracao/equipe";

export const Route = createFileRoute("/_authenticated/refrigeracao-historico")({
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
  patrimonio: string | null;
  status: string;
  fim: string | null;
  updated_at: string;
};

type Foto = { id: string; storage_path: string; created_at: string; legenda: string | null };
type Peca = { id: string; descricao: string; quantidade: number; urgencia: string; observacao: string | null; created_at: string };
type Problema = { id: string; descricao: string; gravidade: string; created_at: string };

function HistoricoPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<OsRow | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["refrig-historico"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("refrigeracao_os")
        .select("id, numero_os, nome_os, predio, andar, local, ativo, equipamento, patrimonio, status, fim, updated_at")
        .eq("status", "concluida")
        .order("fim", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as OsRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((o) =>
      [o.numero_os, o.nome_os, o.ativo, o.equipamento, o.patrimonio, o.predio, o.local]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  return (
    <PageShell
      title="Histórico de OS"
      description="Todas as ordens de serviço já concluídas e enviadas."
    >
      <GlassCard className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por OS, ativo, equipamento, patrimônio, prédio, local…"
            className="h-11 text-base"
          />
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
            Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma OS concluída encontrada.
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {filtered.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setOpen(o)}
                  className="flex w-full items-start gap-3 rounded-md px-2 py-3 text-left transition hover:bg-accent/60"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">OS {o.numero_os}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {o.status}
                      </Badge>
                      {o.fim && (
                        <span className="text-xs text-muted-foreground">
                          concluída em {new Date(o.fim).toLocaleString("pt-BR")}
                        </span>
                      )}
                    </div>
                    {o.nome_os && (
                      <div className="mt-0.5 truncate text-sm font-medium">{o.nome_os}</div>
                    )}
                    <div className="truncate text-sm text-muted-foreground">
                      {o.equipamento} · Ativo {o.ativo}
                      {o.patrimonio ? ` · PAT ${o.patrimonio}` : ""}
                    </div>
                    <div className="truncate text-xs text-muted-foreground/80">
                      {[o.predio, o.andar, o.local].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <OsDetail os={open} onClose={() => setOpen(null)} />
    </PageShell>
  );
}

function OsDetail({ os, onClose }: { os: OsRow | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["refrig-historico-detail", os?.id],
    enabled: !!os,
    queryFn: async () => {
      if (!os) return { fotos: [] as Foto[], pecas: [] as Peca[], problemas: [] as Problema[] };
      const [f, p, pr] = await Promise.all([
        supabase.from("refrigeracao_fotos").select("id, storage_path, created_at, legenda").eq("os_id", os.id).order("created_at"),
        supabase.from("refrigeracao_pecas").select("id, descricao, quantidade, urgencia, observacao, created_at").eq("os_id", os.id).order("created_at"),
        supabase.from("refrigeracao_problemas").select("id, descricao, gravidade, created_at").eq("os_id", os.id).order("created_at"),
      ]);
      return {
        fotos: (f.data ?? []) as Foto[],
        pecas: (p.data ?? []) as Peca[],
        problemas: (pr.data ?? []) as Problema[],
      };
    },
  });

  const [urls, setUrls] = useState<Record<string, string>>({});
  useMemo(() => {
    (async () => {
      if (!data?.fotos?.length) return;
      const next: Record<string, string> = {};
      for (const f of data.fotos) {
        const { data: s } = await supabase.storage
          .from("refrigeracao-fotos")
          .createSignedUrl(f.storage_path, 3600);
        if (s?.signedUrl) next[f.id] = s.signedUrl;
      }
      setUrls(next);
    })();
  }, [data]);

  const downloadPhoto = async (f: Foto, idx: number) => {
    const url = urls[f.id];
    if (!url) return;
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `OS-${os?.numero_os ?? "foto"}-${idx + 1}.jpg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Dialog open={!!os} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[90vh] overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>OS {os?.numero_os} — {os?.nome_os ?? "sem título"}</DialogTitle>
        </DialogHeader>
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
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {data.fotos.map((f, idx) => (
                    <div key={f.id} className="group relative aspect-square overflow-hidden rounded-md border">
                      {urls[f.id] ? (
                        <img src={urls[f.id]} className="h-full w-full object-cover" alt="" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">…</div>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => downloadPhoto(f, idx)}
                        className="absolute right-1 top-1 h-7 w-7 p-0"
                        disabled={!urls[f.id]}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
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
                        <Badge variant="outline" className="text-[10px]">Qtd {p.quantidade}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{p.urgencia}</Badge>
                      </div>
                      {p.observacao && <p className="mt-1 text-xs text-muted-foreground">{p.observacao}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Sem pedidos.</p>
              )}
            </section>

            <section>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <AlertTriangle className="h-4 w-4" /> Problemas ({data?.problemas.length ?? 0})
              </h4>
              {data?.problemas.length ? (
                <ul className="space-y-2">
                  {data.problemas.map((pr) => (
                    <li key={pr.id} className="rounded-md border bg-background/40 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{pr.gravidade}</Badge>
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
