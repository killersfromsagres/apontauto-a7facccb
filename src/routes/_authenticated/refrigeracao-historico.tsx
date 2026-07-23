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
  equipe: string | null;
  patrimonio: string | null;
  status: string;
  fim: string | null;
  updated_at: string;
};

type Foto = { id: string; storage_path: string; created_at: string; legenda: string | null };
type Peca = { id: string; descricao: string; quantidade: number; urgencia: string; observacao: string | null; patrimonio: string | null; modelo: string | null; btus: string | null; status_gestor: string | null; created_at: string };
type Problema = { id: string; descricao: string; gravidade: string; created_at: string };

function equipeStyles(equipe: string | null | undefined): { row: string; badge: string } {
  const n = (equipe ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (n === "refrigeracao 1")
    return {
      row: "border-l-4 border-sky-400 bg-sky-50/70 hover:bg-sky-100/70 dark:bg-sky-500/10 dark:hover:bg-sky-500/20",
      badge: "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-500/20 dark:text-sky-200 dark:border-sky-500/40",
    };
  if (n === "refrigeracao 2")
    return {
      row: "border-l-4 border-teal-400 bg-teal-50/70 hover:bg-teal-100/70 dark:bg-teal-500/10 dark:hover:bg-teal-500/20",
      badge: "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-500/20 dark:text-teal-200 dark:border-teal-500/40",
    };
  if (n === "refrigeracao 3")
    return {
      row: "border-l-4 border-pink-300 bg-pink-50/70 hover:bg-pink-100/70 dark:bg-pink-500/10 dark:hover:bg-pink-500/20",
      badge: "bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-500/20 dark:text-pink-200 dark:border-pink-500/40",
    };
  return { row: "border-l-4 border-transparent hover:bg-accent/60", badge: "" };
}

function HistoricoPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<OsRow | null>(null);
  const [equipe, setEquipe] = useState<EquipeFiltro>("todas");

  useEffect(() => {
    setEquipe(loadEquipe());
  }, []);

  const setEquipeAndPersist = (v: EquipeFiltro) => {
    setEquipe(v);
    saveEquipe(v);
  };

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["refrig-historico"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("refrigeracao_os")
        .select("id, numero_os, nome_os, predio, andar, local, ativo, equipamento, equipe, patrimonio, status, fim, updated_at")
        .eq("status", "concluida")
        .order("fim", { ascending: false, nullsFirst: false })
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
      return [o.numero_os, o.nome_os, o.ativo, o.equipamento, o.patrimonio, o.predio, o.local]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [rows, search, equipe]);

  return (
    <PageShell
      title="Histórico de OS"
      description="Todas as ordens de serviço já concluídas e enviadas."
    >
      <GlassCard className="p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 sm:min-w-[240px]">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Minha equipe
            </span>
            <Select
              value={equipe}
              onValueChange={(v) => setEquipeAndPersist(v as EquipeFiltro)}
            >
              <SelectTrigger className="h-11 flex-1 text-base sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as equipes</SelectItem>
                {EQUIPES_REFRIGERACAO.map((e) => (
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
              placeholder="Buscar por OS, ativo, equipamento, patrimônio, prédio, local…"
              className="h-11 text-base"
            />
          </div>
        </div>
        {equipe !== "todas" && (
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="text-[10px]">{equipe}</Badge>
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
            Nenhuma OS concluída encontrada.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((o) => {
              const st = equipeStyles(o.equipe);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(o)}
                    className={`flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition ${st.row}`}
                  >
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">OS {o.numero_os}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {o.status}
                        </Badge>
                        {o.equipe && (
                          <Badge variant="outline" className={`text-[10px] ${st.badge}`}>
                            {o.equipe}
                          </Badge>
                        )}
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
    queryKey: ["refrig-historico-detail", os?.id],
    enabled: !!os,
    queryFn: async () => {
      if (!os) return { fotos: [] as Foto[], pecas: [] as Peca[], problemas: [] as Problema[] };
      const [f, p, pr] = await Promise.all([
        supabase.from("refrigeracao_fotos").select("id, storage_path, created_at, legenda").eq("os_id", os.id).order("created_at"),
        supabase.from("refrigeracao_pecas").select("id, descricao, quantidade, urgencia, observacao, patrimonio, modelo, btus, status_gestor, created_at").eq("os_id", os.id).order("created_at"),

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
            <section className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{os?.status}</Badge>
                {os?.equipe && (
                  <Badge variant="outline" className="text-[10px]">{os.equipe}</Badge>
                )}
                {os?.fim && (
                  <span className="text-[11px] text-muted-foreground">
                    Concluída em {new Date(os.fim).toLocaleString("pt-BR")}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                <InfoField label="Prédio" value={os?.predio ?? "—"} />
                <InfoField label="Andar" value={os?.andar ?? "—"} />
                <InfoField label="Local" value={os?.local ?? "—"} />
                <InfoField label="Máquina / Equipamento" value={os?.equipamento ?? "—"} />
                <InfoField label="Ativo" value={os?.ativo ?? "—"} mono />
                {os?.patrimonio && (
                  <InfoField label="Patrimônio" value={os.patrimonio} mono highlight />
                )}
              </div>
            </section>

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
                        {p.status_gestor && (
                          <Badge variant="outline" className="text-[10px]">{p.status_gestor}</Badge>
                        )}
                      </div>
                      {(p.patrimonio || p.modelo || p.btus) && (
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          {p.patrimonio && <span>PAT <span className="font-mono">{p.patrimonio}</span></span>}
                          {p.modelo && <span>Modelo: {p.modelo}</span>}
                          {p.btus && <span>{p.btus} BTUs</span>}
                        </div>
                      )}
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

function InfoField({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`truncate text-sm ${mono ? "font-mono" : ""} ${
          highlight ? "font-semibold text-emerald-700 dark:text-emerald-300" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
