import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Package,
  AlertTriangle,
  Camera,
  Loader2,
  CheckCircle2,
  Users as UsersIcon,
  CalendarDays,
  Trophy,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
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
import { EQUIPES_REFRIGERACAO } from "@/lib/refrigeracao/equipe";

export const Route = createFileRoute("/_authenticated/refrigeracao-colaboradores")({
  component: ColaboradoresPage,
});

/**
 * Histórico de Colaboradores por Equipe.
 * Como a conta operacional "climatizacao" é compartilhada entre as três equipes
 * de campo, o "colaborador" aqui é representado pela equipe (Refrigeração 1/2/3).
 * Cada OS concluída conta como uma melhoria realizada; peças trocadas e
 * problemas registrados enriquecem a linha do tempo.
 */

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
  status: string;
  fim: string | null;
  updated_at: string;
};

type CountRow = { os_id: string };

type Melhoria = OsRow & {
  pecas: number;
  problemas: number;
  fotos: number;
  data: string; // ISO
};

function normEquipe(v: string | null | undefined) {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function equipeStyles(equipe: string | null | undefined) {
  const n = normEquipe(equipe);
  if (n === "refrigeracao 1")
    return {
      ring: "ring-sky-400/50",
      border: "border-l-4 border-sky-400",
      bg: "bg-sky-50/70 dark:bg-sky-500/10",
      chip: "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-500/20 dark:text-sky-100 dark:border-sky-500/40",
      dot: "bg-sky-400",
      grad: "from-sky-500/15 to-transparent",
    };
  if (n === "refrigeracao 2")
    return {
      ring: "ring-teal-400/50",
      border: "border-l-4 border-teal-400",
      bg: "bg-teal-50/70 dark:bg-teal-500/10",
      chip: "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-500/20 dark:text-teal-100 dark:border-teal-500/40",
      dot: "bg-teal-400",
      grad: "from-teal-500/15 to-transparent",
    };
  if (n === "refrigeracao 3")
    return {
      ring: "ring-pink-300/50",
      border: "border-l-4 border-pink-300",
      bg: "bg-pink-50/70 dark:bg-pink-500/10",
      chip: "bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-500/20 dark:text-pink-100 dark:border-pink-500/40",
      dot: "bg-pink-300",
      grad: "from-pink-500/15 to-transparent",
    };
  return {
    ring: "ring-muted-foreground/20",
    border: "border-l-4 border-muted-foreground/30",
    bg: "bg-muted/30",
    chip: "bg-muted text-foreground border-border",
    dot: "bg-muted-foreground/50",
    grad: "from-muted/40 to-transparent",
  };
}

function periodStart(period: "7d" | "30d" | "90d" | "all"): Date | null {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function ColaboradoresPage() {
  const [search, setSearch] = useState("");
  const [equipeFiltro, setEquipeFiltro] = useState<"todas" | (typeof EQUIPES_REFRIGERACAO)[number]>("todas");
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "all">("30d");
  const [ordem, setOrdem] = useState<"recentes" | "antigas" | "equipe">("recentes");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["refrig-colab-os"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("refrigeracao_os")
        .select("id, numero_os, nome_os, predio, andar, local, ativo, equipamento, equipe, status, fim, updated_at")
        .eq("status", "concluida")
        .order("fim", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as OsRow[];
    },
  });

  const osIds = useMemo(() => rows.map((r) => r.id), [rows]);

  const { data: pecas = [] } = useQuery({
    queryKey: ["refrig-colab-pecas", osIds.length],
    enabled: osIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("refrigeracao_pecas")
        .select("os_id")
        .in("os_id", osIds);
      if (error) throw error;
      return (data ?? []) as CountRow[];
    },
  });

  const { data: problemas = [] } = useQuery({
    queryKey: ["refrig-colab-problemas", osIds.length],
    enabled: osIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("refrigeracao_problemas")
        .select("os_id")
        .in("os_id", osIds);
      if (error) throw error;
      return (data ?? []) as CountRow[];
    },
  });

  const { data: fotos = [] } = useQuery({
    queryKey: ["refrig-colab-fotos", osIds.length],
    enabled: osIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("refrigeracao_fotos")
        .select("os_id")
        .in("os_id", osIds);
      if (error) throw error;
      return (data ?? []) as CountRow[];
    },
  });

  const melhorias = useMemo<Melhoria[]>(() => {
    const cnt = (arr: CountRow[]) => {
      const m = new Map<string, number>();
      for (const r of arr) m.set(r.os_id, (m.get(r.os_id) ?? 0) + 1);
      return m;
    };
    const cP = cnt(pecas);
    const cQ = cnt(problemas);
    const cF = cnt(fotos);
    return rows.map((r) => ({
      ...r,
      pecas: cP.get(r.id) ?? 0,
      problemas: cQ.get(r.id) ?? 0,
      fotos: cF.get(r.id) ?? 0,
      data: r.fim ?? r.updated_at,
    }));
  }, [rows, pecas, problemas, fotos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const start = periodStart(period);
    const base = melhorias.filter((m) => {
      if (equipeFiltro !== "todas" && normEquipe(m.equipe) !== normEquipe(equipeFiltro)) return false;
      if (start && new Date(m.data) < start) return false;
      if (!q) return true;
      return (
        m.numero_os.toLowerCase().includes(q) ||
        m.ativo.toLowerCase().includes(q) ||
        m.equipamento.toLowerCase().includes(q) ||
        (m.nome_os ?? "").toLowerCase().includes(q) ||
        (m.predio ?? "").toLowerCase().includes(q) ||
        (m.local ?? "").toLowerCase().includes(q) ||
        (m.equipe ?? "").toLowerCase().includes(q)
      );
    });
    const sorted = [...base];
    if (ordem === "recentes") sorted.sort((a, b) => +new Date(b.data) - +new Date(a.data));
    else if (ordem === "antigas") sorted.sort((a, b) => +new Date(a.data) - +new Date(b.data));
    else
      sorted.sort((a, b) => {
        const c = normEquipe(a.equipe).localeCompare(normEquipe(b.equipe));
        if (c !== 0) return c;
        return +new Date(b.data) - +new Date(a.data);
      });
    return sorted;
  }, [melhorias, search, equipeFiltro, period, ordem]);

  const resumoEquipes = useMemo(() => {
    return EQUIPES_REFRIGERACAO.map((eq) => {
      const items = filtered.filter((m) => normEquipe(m.equipe) === normEquipe(eq));
      const totalPecas = items.reduce((s, i) => s + i.pecas, 0);
      const totalProblemas = items.reduce((s, i) => s + i.problemas, 0);
      const totalFotos = items.reduce((s, i) => s + i.fotos, 0);
      return {
        equipe: eq,
        melhorias: items.length,
        pecas: totalPecas,
        problemas: totalProblemas,
        fotos: totalFotos,
      };
    });
  }, [filtered]);

  const topEquipe = useMemo(() => {
    const sorted = [...resumoEquipes].sort((a, b) => b.melhorias - a.melhorias);
    return sorted[0]?.melhorias ? sorted[0].equipe : null;
  }, [resumoEquipes]);

  return (
    <PageShell
      title="Histórico de Colaboradores"
      description="Melhorias realizadas por equipe (Refrigeração 1 · 2 · 3). Cada OS concluída representa uma intervenção do colaborador em campo."
    >
      {/* Resumo por equipe */}
      <div className="grid gap-3 sm:grid-cols-3">
        {resumoEquipes.map((r) => {
          const s = equipeStyles(r.equipe);
          const isTop = topEquipe === r.equipe && r.melhorias > 0;
          return (
            <GlassCard
              key={r.equipe}
              className={`${s.border} ${s.bg} relative overflow-hidden`}
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${s.grad}`} />
              <div className="relative flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
                    <p className="text-sm font-semibold">{r.equipe}</p>
                    {isTop && (
                      <Badge variant="outline" className="border-amber-400/60 bg-amber-100/70 text-amber-800 dark:bg-amber-500/20 dark:text-amber-100">
                        <Trophy className="mr-1 h-3 w-3" /> Destaque
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{r.melhorias}</p>
                  <p className="text-xs text-muted-foreground">melhorias no período</p>
                </div>
                <UsersIcon className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <div className="relative mt-3 flex flex-wrap gap-1.5 text-xs">
                <Badge variant="secondary" className="gap-1"><Package className="h-3 w-3" />{r.pecas} peças</Badge>
                <Badge variant="secondary" className="gap-1"><AlertTriangle className="h-3 w-3" />{r.problemas} problemas</Badge>
                <Badge variant="secondary" className="gap-1"><Camera className="h-3 w-3" />{r.fotos} fotos</Badge>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* Filtros */}
      <GlassCard className="mt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por OS, ativo, equipamento, prédio, local…"
              className="pl-9"
            />
          </div>
          <Select value={equipeFiltro} onValueChange={(v) => setEquipeFiltro(v as any)}>
            <SelectTrigger className="sm:w-48"><SelectValue placeholder="Equipe" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as equipes</SelectItem>
              {EQUIPES_REFRIGERACAO.map((eq) => (
                <SelectItem key={eq} value={eq}>{eq}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
            <SelectTrigger className="sm:w-40"><SelectValue placeholder="Período" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
              <SelectItem value="all">Tudo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ordem} onValueChange={(v) => setOrdem(v as any)}>
            <SelectTrigger className="sm:w-44"><SelectValue placeholder="Ordenar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recentes">Mais recentes</SelectItem>
              <SelectItem value="antigas">Mais antigas</SelectItem>
              <SelectItem value="equipe">Por equipe</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </GlassCard>

      {/* Timeline */}
      <div className="mt-4">
        {isLoading ? (
          <GlassCard className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando histórico…
          </GlassCard>
        ) : filtered.length === 0 ? (
          <GlassCard className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma melhoria encontrada para os filtros atuais.
          </GlassCard>
        ) : (
          <ol className="relative space-y-3 border-l border-border/60 pl-4 sm:pl-6">
            {filtered.map((m) => {
              const s = equipeStyles(m.equipe);
              const dt = new Date(m.data);
              return (
                <li key={m.id} className="relative">
                  <span className={`absolute -left-[22px] top-4 h-3 w-3 rounded-full ring-4 ring-background ${s.dot}`} />
                  <GlassCard className={`${s.border} ${s.bg} p-3 sm:p-4`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={s.chip}>{m.equipe ?? "Sem equipe"}</Badge>
                          <span className="font-mono text-sm font-semibold">#{m.numero_os}</span>
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Concluída
                          </span>
                        </div>
                        <p className="mt-1.5 truncate text-sm font-medium">
                          {m.equipamento}
                          {m.ativo ? <span className="text-muted-foreground"> · {m.ativo}</span> : null}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {[m.predio, m.andar, m.local].filter(Boolean).join(" · ") || "Sem localização"}
                          {m.nome_os ? ` — ${m.nome_os}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {dt.toLocaleDateString("pt-BR")} {dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                      {m.pecas > 0 && (
                        <Badge variant="secondary" className="gap-1"><Package className="h-3 w-3" />{m.pecas} peça{m.pecas > 1 ? "s" : ""}</Badge>
                      )}
                      {m.problemas > 0 && (
                        <Badge variant="secondary" className="gap-1"><AlertTriangle className="h-3 w-3" />{m.problemas} problema{m.problemas > 1 ? "s" : ""}</Badge>
                      )}
                      {m.fotos > 0 && (
                        <Badge variant="secondary" className="gap-1"><Camera className="h-3 w-3" />{m.fotos} foto{m.fotos > 1 ? "s" : ""}</Badge>
                      )}
                      {m.pecas === 0 && m.problemas === 0 && m.fotos === 0 && (
                        <span className="text-muted-foreground">Sem registros adicionais</span>
                      )}
                    </div>
                  </GlassCard>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </PageShell>
  );
}
