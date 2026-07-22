import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Radio, Loader2, CheckCircle2, AlertTriangle, Clock, ArrowRight } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { supabase } from "@/integrations/supabase/client";
import { useLotes, useOsItens, type Lote } from "@/lib/prisma-panel/hooks";
import { StatusBadge } from "./status-badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function formatDate(d: string) {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function isToday(d: string) {
  const dt = new Date(d);
  const now = new Date();
  return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth() && dt.getDate() === now.getDate();
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof Clock;
  tone?: "default" | "blue" | "emerald" | "amber" | "rose";
}) {
  const toneCls = {
    default: "text-foreground",
    blue: "text-blue-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
  }[tone];
  return (
    <GlassCard className="!rounded-[28px] !p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={cn("mt-2 font-display text-3xl font-semibold tracking-tight", toneCls)}>{value}</p>
          {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
        <Icon className={cn("h-5 w-5 shrink-0 opacity-70", toneCls)} />
      </div>
    </GlassCard>
  );
}

function DynamicIsland({ lote }: { lote: Lote }) {
  const { data: itens = [] } = useOsItens(lote.id);
  const atual = itens.find((i) => i.status === "em_execucao") ?? itens.find((i) => i.status === "pendente");
  const pct = lote.total_os > 0 ? Math.round((lote.os_concluidas / lote.total_os) * 100) : 0;

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10 p-5 backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(600px_at_20%_-10%,rgba(99,102,241,0.35),transparent),radial-gradient(500px_at_80%_120%,rgba(236,72,153,0.25),transparent)]" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
            <span className="text-[11px] font-medium uppercase tracking-widest text-emerald-300">Ao vivo</span>
          </div>
          <h3 className="truncate font-display text-lg font-semibold tracking-tight sm:text-xl">
            {lote.nome ?? "Lote sem nome"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {atual ? (
              <>
                OS atual: <span className="font-mono text-foreground">{atual.numero_os}</span>
              </>
            ) : (
              "Aguardando extensão iniciar próxima OS..."
            )}
          </p>
        </div>
        <div className="min-w-[220px]">
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">
              {lote.os_concluidas} / {lote.total_os} OS
            </span>
            <span className="font-display font-semibold">{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function DashboardTab({ onNovoLote }: { onNovoLote: () => void }) {
  const { data: lotes = [], isLoading } = useLotes();

  const stats = useMemo(() => {
    const pendentes = lotes.filter((l) => l.status === "pendente").length;
    const emExec = lotes.filter((l) => l.status === "em_execucao");
    const concluidosHoje = lotes.filter((l) => l.status === "concluido" && l.finalizado_em && isToday(l.finalizado_em)).length;
    const totalOsHoje = lotes.filter((l) => isToday(l.criado_em)).reduce((s, l) => s + l.total_os, 0);
    const errosHoje = lotes.filter((l) => isToday(l.criado_em)).reduce((s, l) => s + l.os_com_erro, 0);
    const taxaErro = totalOsHoje > 0 ? Math.round((errosHoje / totalOsHoje) * 100) : 0;
    return { pendentes, emExec, concluidosHoje, taxaErro };
  }, [lotes]);

  const [publicando, setPublicando] = useState<string | null>(null);
  const enviarParaExecucao = async (id: string) => {
    setPublicando(id);
    const { error } = await supabase.from("prisma_lotes").update({ status: "pendente" }).eq("id", id);
    setPublicando(null);
    if (error) toast.error(error.message);
    else toast.success("Lote enviado para execução — a extensão vai capturar em segundos.");
  };

  return (
    <div className="space-y-5">
      {stats.emExec.map((l) => (
        <DynamicIsland key={l.id} lote={l} />
      ))}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pendentes" value={stats.pendentes} hint="Aguardando extensão" icon={Clock} tone="amber" />
        <StatCard label="Em execução" value={stats.emExec.length} hint="Processando agora" icon={Loader2} tone="blue" />
        <StatCard label="Concluídos hoje" value={stats.concluidosHoje} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Taxa de erro" value={`${stats.taxaErro}%`} hint="Nas OS de hoje" icon={AlertTriangle} tone="rose" />
      </div>

      <GlassCard className="!rounded-[28px] !p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight">Últimos lotes</h3>
            <p className="text-xs text-muted-foreground">Atualização em tempo real via Realtime.</p>
          </div>
          <Button onClick={onNovoLote} size="sm" className="rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white active:scale-95">
            Novo lote <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : lotes.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-white/10 py-10 text-center">
            <Radio className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Nenhum lote criado ainda.</p>
            <p className="mt-1 text-xs text-muted-foreground">Crie seu primeiro lote para começar.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {lotes.slice(0, 12).map((l) => {
              const pct = l.total_os > 0 ? Math.round((l.os_concluidas / l.total_os) * 100) : 0;
              return (
                <li
                  key={l.id}
                  className="group rounded-[20px] border border-white/5 bg-white/[0.02] p-3 transition hover:border-white/15 hover:bg-white/[0.05] sm:p-4"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{l.nome ?? "Lote sem nome"}</span>
                        <StatusBadge status={l.status} />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{l.categoria}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatDate(l.criado_em)} · {l.os_concluidas} de {l.total_os} OS
                        {l.os_com_erro > 0 && <span className="ml-2 text-rose-300">· {l.os_com_erro} erro(s)</span>}
                      </p>
                    </div>
                    {l.status === "rascunho" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full active:scale-95"
                        disabled={publicando === l.id || l.total_os === 0}
                        onClick={() => enviarParaExecucao(l.id)}
                      >
                        Enviar para execução
                      </Button>
                    )}
                  </div>
                  {l.total_os > 0 && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div
                        className={cn(
                          "h-full transition-all duration-500",
                          l.status === "erro"
                            ? "bg-rose-500"
                            : "bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500",
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
