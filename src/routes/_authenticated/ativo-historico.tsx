import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Camera,
  Package,
  AlertTriangle,
  Loader2,
  Snowflake,
  ArrowLeft,
  Download,
  History,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/ativo-historico")({
  component: AtivoHistoricoPage,
  validateSearch: (s: Record<string, unknown>) => ({
    ativo: typeof s.ativo === "string" ? s.ativo : "",
    equipamento: typeof s.equipamento === "string" ? s.equipamento : "",
    patrimonio: typeof s.patrimonio === "string" ? s.patrimonio : "",
  }),
  head: () => ({
    meta: [
      { title: "Histórico do Ativo — Apont Auto" },
      { name: "description", content: "Histórico completo de refrigeração do ativo escaneado." },
    ],
  }),
});

type OsRow = {
  id: string;
  numero_os: string;
  nome_os: string | null;
  predio: string | null;
  andar: string | null;
  local: string | null;
  tipo: string | null;
  equipe: string | null;
  ativo: string;
  equipamento: string;
  patrimonio: string | null;
  status: string;
  data_programada: string | null;
  fim: string | null;
  created_at: string;
  updated_at: string;
};

type Foto = { id: string; os_id: string; storage_path: string; created_at: string; legenda: string | null };
type Peca = { id: string; os_id: string; descricao: string; quantidade: number; urgencia: string; observacao: string | null; created_at: string };
type Problema = { id: string; os_id: string; descricao: string; gravidade: string; created_at: string };

const STATUS_COLOR: Record<string, string> = {
  aberta: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  em_andamento: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  concluida: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  cancelada: "bg-rose-500/15 text-rose-600 border-rose-500/30",
};

function AtivoHistoricoPage() {
  const { ativo, equipamento, patrimonio } = Route.useSearch();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["ativo-historico", ativo, equipamento, patrimonio],
    queryFn: async () => {
      let q = supabase
        .from("refrigeracao_os")
        .select(
          "id, numero_os, nome_os, predio, andar, local, tipo, equipe, ativo, equipamento, patrimonio, status, data_programada, fim, created_at, updated_at",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (ativo) q = q.ilike("ativo", ativo);
      if (equipamento) q = q.ilike("equipamento", equipamento);
      if (patrimonio) q = q.ilike("patrimonio", patrimonio);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as OsRow[];
    },
    enabled: !!(ativo || equipamento || patrimonio),
  });

  const osIds = rows.map((r) => r.id);

  const { data: extras } = useQuery({
    queryKey: ["ativo-historico-extras", osIds.join(",")],
    enabled: osIds.length > 0,
    queryFn: async () => {
      const [f, p, pr] = await Promise.all([
        supabase.from("refrigeracao_fotos").select("id, os_id, storage_path, created_at, legenda").in("os_id", osIds),
        supabase.from("refrigeracao_pecas").select("id, os_id, descricao, quantidade, urgencia, observacao, created_at").in("os_id", osIds),
        supabase.from("refrigeracao_problemas").select("id, os_id, descricao, gravidade, created_at").in("os_id", osIds),
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
      const fotos = extras?.fotos ?? [];
      if (!fotos.length) return;
      const next: Record<string, string> = {};
      for (const f of fotos) {
        const { data: s } = await supabase.storage
          .from("refrigeracao-fotos")
          .createSignedUrl(f.storage_path, 3600);
        if (s?.signedUrl) next[f.id] = s.signedUrl;
      }
      setUrls(next);
    })();
  }, [extras]);

  const header = ativo || equipamento || patrimonio;

  const stats = useMemo(() => {
    const concl = rows.filter((r) => r.status === "concluida").length;
    const abertas = rows.filter((r) => r.status === "aberta" || r.status === "em_andamento").length;
    return { total: rows.length, concl, abertas };
  }, [rows]);

  return (
    <PageShell
      title="Histórico do Ativo"
      description="Todas as ordens de refrigeração deste ativo/equipamento."
    >
      <Link to="/" className="mb-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <GlassCard className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-full bg-primary/10 p-3">
            <Snowflake className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold">{header || "Ativo não informado"}</h2>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {ativo && <span><b className="text-foreground">Ativo:</b> {ativo}</span>}
              {equipamento && <span><b className="text-foreground">Equipamento:</b> {equipamento}</span>}
              {patrimonio && <span><b className="text-foreground">Patrimônio:</b> {patrimonio}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Total: {stats.total}</Badge>
            <Badge className={STATUS_COLOR.concluida}>Concluídas: {stats.concl}</Badge>
            <Badge className={STATUS_COLOR.aberta}>Abertas: {stats.abertas}</Badge>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="mt-4 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <History className="h-4 w-4" /> Ordens de serviço
        </h3>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" /> Carregando…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma OS de refrigeração encontrada para este ativo.
          </div>
        ) : (
          <ul className="space-y-4">
            {rows.map((o) => {
              const fotos = extras?.fotos.filter((f) => f.os_id === o.id) ?? [];
              const pecas = extras?.pecas.filter((p) => p.os_id === o.id) ?? [];
              const problemas = extras?.problemas.filter((p) => p.os_id === o.id) ?? [];
              return (
                <li key={o.id} className="rounded-lg border bg-background/40 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">OS {o.numero_os}</span>
                    <Badge className={STATUS_COLOR[o.status] ?? ""}>{o.status}</Badge>
                    {o.equipe && <Badge variant="secondary" className="text-[10px]">{o.equipe}</Badge>}
                    {o.fim && (
                      <span className="text-xs text-muted-foreground">
                        concluída em {new Date(o.fim).toLocaleString("pt-BR")}
                      </span>
                    )}
                  </div>
                  {o.nome_os && <div className="mt-1 text-sm font-medium">{o.nome_os}</div>}
                  <div className="text-xs text-muted-foreground">
                    {[o.predio, o.andar, o.local].filter(Boolean).join(" · ") || "—"}
                  </div>

                  {fotos.length > 0 && (
                    <div className="mt-3">
                      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <Camera className="h-3.5 w-3.5" /> Fotos ({fotos.length})
                      </div>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                        {fotos.map((f) => (
                          <a
                            key={f.id}
                            href={urls[f.id]}
                            target="_blank"
                            rel="noreferrer"
                            className="relative block aspect-square overflow-hidden rounded-md border"
                          >
                            {urls[f.id] ? (
                              <img src={urls[f.id]} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">…</div>
                            )}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {pecas.length > 0 && (
                    <div className="mt-3">
                      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <Package className="h-3.5 w-3.5" /> Peças ({pecas.length})
                      </div>
                      <ul className="space-y-1 text-sm">
                        {pecas.map((p) => (
                          <li key={p.id} className="rounded border bg-background/60 px-2 py-1">
                            <span className="font-medium">{p.descricao}</span>{" "}
                            <span className="text-xs text-muted-foreground">
                              · Qtd {p.quantidade} · {p.urgencia}
                            </span>
                            {p.observacao && (
                              <div className="text-xs text-muted-foreground">{p.observacao}</div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {problemas.length > 0 && (
                    <div className="mt-3">
                      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5" /> Problemas ({problemas.length})
                      </div>
                      <ul className="space-y-1 text-sm">
                        {problemas.map((pr) => (
                          <li key={pr.id} className="rounded border bg-background/60 px-2 py-1">
                            <Badge variant="outline" className="mr-2 text-[10px]">{pr.gravidade}</Badge>
                            {pr.descricao}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>
    </PageShell>
  );
}

// Keep referenced icon to prevent tree-shake warnings if unused above.
void Download;
