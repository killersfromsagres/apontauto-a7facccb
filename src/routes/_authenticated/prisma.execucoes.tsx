import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X, CheckCircle2, XCircle, Clock, Activity, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/prisma/execucoes")({
  component: ExecucoesPage,
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
  iniciado_em: string | null;
  finalizado_em: string | null;
};

type Log = {
  id: string;
  etapa: string;
  status: string;
  mensagem: string | null;
  criado_em: string;
  os_item_id: string | null;
};

function ExecucoesPage() {
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: lotes = [] } = useQuery({
    queryKey: ["prisma", "lotes", "hist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prisma_lotes")
        .select(
          "id,nome,categoria,status,total_os,os_concluidas,os_com_erro,criado_em,iniciado_em,finalizado_em",
        )
        .order("criado_em", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Lote[];
    },
  });

  const filtered = lotes.filter((l) => {
    if (statusFilter !== "todos" && l.status !== statusFilter) return false;
    if (q && !(l.nome ?? "").toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-2xl sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome..."
            className="w-full rounded-full border border-white/10 bg-black/20 py-2 pl-9 pr-3 text-sm outline-none focus:border-white/30"
          />
        </div>
        {["todos", "rascunho", "pendente", "em_execucao", "concluido", "erro"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              statusFilter === s
                ? "bg-white/15 text-white"
                : "bg-white/[0.04] text-white/60 hover:bg-white/[0.08]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/40">
            <tr className="text-left text-xs uppercase tracking-wider text-white/50">
              <th className="px-4 py-3">Lote</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Progresso</th>
              <th className="px-4 py-3">Criado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr
                key={l.id}
                onClick={() => setOpenId(l.id)}
                className="cursor-pointer border-t border-white/5 transition hover:bg-white/[0.04]"
              >
                <td className="px-4 py-3">
                  <p className="font-medium">{l.nome || "(sem nome)"}</p>
                  <p className="text-xs text-white/40">{l.categoria}</p>
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={l.status} />
                </td>
                <td className="px-4 py-3 text-xs text-white/70 tabular-nums">
                  {l.os_concluidas}/{l.total_os}
                  {l.os_com_erro > 0 && (
                    <span className="ml-1 text-rose-400">· {l.os_com_erro} erro</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-white/50">
                  {new Date(l.criado_em).toLocaleString("pt-BR")}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-white/50">
                  Nenhum lote encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {openId && <LogDrawer loteId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function LogDrawer({ loteId, onClose }: { loteId: string; onClose: () => void }) {
  const { data: logs = [] } = useQuery({
    queryKey: ["prisma", "logs", loteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prisma_execucao_logs")
        .select("id,etapa,status,mensagem,criado_em,os_item_id")
        .eq("lote_id", loteId)
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return data as Log[];
    },
    refetchInterval: 3000,
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-in slide-in-from-right w-full max-w-lg overflow-y-auto border-l border-white/10 bg-[#0A0A0C]/95 p-6 backdrop-blur-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold tracking-tight">Log de execução</h3>
          <button
            onClick={onClose}
            className="rounded-full bg-white/[0.06] p-2 transition hover:bg-white/[0.1]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-1 rounded-2xl border border-white/10 bg-black/40 p-3 font-mono text-xs">
          {logs.length === 0 ? (
            <p className="py-6 text-center text-white/40">Sem logs ainda.</p>
          ) : (
            logs.map((l) => <LogLine key={l.id} log={l} />)
          )}
        </div>
      </div>
    </div>
  );
}

function LogLine({ log }: { log: Log }) {
  const icon =
    log.status === "concluido" ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
    ) : log.status === "erro" ? (
      <XCircle className="h-3.5 w-3.5 text-rose-400" />
    ) : log.status === "em_execucao" ? (
      <Activity className="h-3.5 w-3.5 text-blue-400" />
    ) : (
      <Clock className="h-3.5 w-3.5 text-white/40" />
    );
  return (
    <div className="flex items-start gap-2 rounded px-2 py-1 hover:bg-white/[0.03]">
      <span className="shrink-0 pt-0.5 text-white/40">
        {new Date(log.criado_em).toLocaleTimeString("pt-BR")}
      </span>
      {icon}
      <span className="text-white/60">[{log.etapa}]</span>
      <span className="text-white/85">{log.mensagem}</span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    rascunho: "bg-white/10 text-white/70",
    pendente: "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30",
    em_execucao: "bg-blue-400/15 text-blue-300 ring-1 ring-blue-400/30",
    concluido: "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30",
    erro: "bg-rose-400/15 text-rose-300 ring-1 ring-rose-400/30",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
        map[status] || map.rascunho
      }`}
    >
      {status}
    </span>
  );
}
