import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Activity, CheckCircle2, Clock, XCircle, Plus, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/prisma/")({
  component: PrismaDashboard,
});

type Lote = {
  id: string;
  nome: string | null;
  categoria: string;
  status: string;
  total_os: number;
  os_concluidas: number;
  os_com_erro: number;
  criado_em: string;
};

type OsEmAndamento = { numero_os: string; ordem: number; lote_id: string } | null;

function PrismaDashboard() {
  const qc = useQueryClient();

  const { data: lotes = [] } = useQuery({
    queryKey: ["prisma", "lotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prisma_lotes")
        .select("id,nome,categoria,status,total_os,os_concluidas,os_com_erro,criado_em")
        .order("criado_em", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as Lote[];
    },
    staleTime: 15_000,
  });

  const [emAndamento, setEmAndamento] = useState<OsEmAndamento>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("prisma_os_itens")
        .select("numero_os,ordem,lote_id")
        .eq("status", "em_execucao")
        .order("atualizado_em", { ascending: false })
        .limit(1);
      if (!cancelled) setEmAndamento((data?.[0] as OsEmAndamento) ?? null);
    };
    load();
    const ch = supabase
      .channel("prisma-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prisma_os_itens" },
        () => {
          load();
          qc.invalidateQueries({ queryKey: ["prisma", "lotes"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prisma_lotes" },
        () => qc.invalidateQueries({ queryKey: ["prisma", "lotes"] }),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const hoje = new Date().toISOString().slice(0, 10);
  const pend = lotes.filter((l) => l.status === "pendente").length;
  const exec = lotes.filter((l) => l.status === "em_execucao").length;
  const concHoje = lotes.filter(
    (l) => l.status === "concluido" && l.criado_em.slice(0, 10) === hoje,
  ).length;
  const totalOs = lotes.reduce((s, l) => s + (l.total_os || 0), 0);
  const totalErr = lotes.reduce((s, l) => s + (l.os_com_erro || 0), 0);
  const taxaErro = totalOs > 0 ? Math.round((totalErr / totalOs) * 100) : 0;

  return (
    <div className="space-y-6">
      {emAndamento && (
        <div className="animate-fade-in flex items-center gap-3 rounded-full border border-blue-400/30 bg-gradient-to-r from-blue-500/15 via-purple-500/15 to-pink-500/10 px-5 py-3 backdrop-blur-2xl">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-400" />
          </span>
          <p className="text-sm font-medium">
            OS <span className="font-bold text-blue-300">{emAndamento.numero_os}</span> em
            andamento — {emAndamento.ordem} de{" "}
            {lotes.find((l) => l.id === emAndamento.lote_id)?.total_os ?? "?"}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Pendentes" value={pend} icon={Clock} color="from-amber-400 to-orange-400" />
        <StatCard label="Em execução" value={exec} icon={Activity} color="from-blue-400 to-cyan-400" />
        <StatCard label="Concluídos hoje" value={concHoje} icon={CheckCircle2} color="from-emerald-400 to-teal-400" />
        <StatCard label="Taxa de erro" value={`${taxaErro}%`} icon={XCircle} color="from-rose-400 to-pink-400" />
      </div>

      <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-2xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">Últimos lotes</h2>
          <Link
            to="/prisma/novo"
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-medium transition hover:bg-white/15 active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" /> Novo lote
          </Link>
        </div>
        {lotes.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/50">
            Nenhum lote ainda. Crie o primeiro em <span className="text-white/80">Novo Lote</span>.
          </p>
        ) : (
          <ul className="space-y-2">
            {lotes.slice(0, 12).map((l) => {
              const pct = l.total_os > 0 ? (l.os_concluidas / l.total_os) * 100 : 0;
              return (
                <li key={l.id}>
                  <Link
                    to="/prisma/novo"
                    search={{ id: l.id }}
                    className="group flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.03] p-4 transition hover:border-white/15 hover:bg-white/[0.06]"
                  >
                    <StatusPill status={l.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {l.nome || `Lote sem nome`}{" "}
                        <span className="text-xs text-white/40">· {l.categoria}</span>
                      </p>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-xs tabular-nums text-white/60">
                          {l.os_concluidas}/{l.total_os}
                          {l.os_com_erro > 0 && (
                            <span className="ml-1.5 text-rose-400">· {l.os_com_erro} erro</span>
                          )}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-white/30 transition group-hover:translate-x-0.5 group-hover:text-white/60" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: typeof Activity;
  color: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-2xl sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-white/50">{label}</p>
        <div className={`grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br ${color} opacity-90`}>
          <Icon className="h-4 w-4 text-black/70" strokeWidth={2.25} />
        </div>
      </div>
      <p className="mt-3 font-display text-3xl font-bold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    rascunho: { label: "Rascunho", cls: "bg-white/10 text-white/70" },
    pendente: { label: "Pendente", cls: "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30" },
    em_execucao: { label: "Executando", cls: "bg-blue-400/15 text-blue-300 ring-1 ring-blue-400/30" },
    concluido: { label: "Concluído", cls: "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30" },
    erro: { label: "Erro", cls: "bg-rose-400/15 text-rose-300 ring-1 ring-rose-400/30" },
  };
  const s = map[status] ?? map.rascunho;
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${s.cls}`}>
      {s.label}
    </span>
  );
}
