import { useMemo, useState } from "react";
import { CheckCircle2, XCircle, Circle, Terminal, X } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLogs, useLotes, useOsItens, type Lote } from "@/lib/prisma-panel/hooks";
import { StatusBadge } from "./status-badge";
import { cn } from "@/lib/utils";

function fmt(t: string) {
  return new Date(t).toLocaleString("pt-BR");
}
function fmtTime(t: string) {
  return new Date(t).toLocaleTimeString("pt-BR", { hour12: false });
}

export function ExecucoesTab() {
  const { data: lotes = [] } = useLotes();
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [openLote, setOpenLote] = useState<Lote | null>(null);

  const filtrados = useMemo(
    () => lotes.filter((l) => statusFiltro === "todos" || l.status === statusFiltro),
    [lotes, statusFiltro],
  );

  return (
    <GlassCard className="!rounded-[28px] !p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-semibold tracking-tight">Execuções</h3>
          <p className="text-xs text-muted-foreground">Clique em um lote para ver o log completo.</p>
        </div>
        <Select value={statusFiltro} onValueChange={setStatusFiltro}>
          <SelectTrigger className="h-8 w-[180px] rounded-full border-white/10 bg-white/[0.04] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="rascunho">Rascunho</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="em_execucao">Em execução</SelectItem>
            <SelectItem value="concluido">Concluído</SelectItem>
            <SelectItem value="erro">Erro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="pb-2">Lote</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Progresso</th>
              <th className="pb-2">Criado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                  Nenhum lote com esse filtro.
                </td>
              </tr>
            )}
            {filtrados.map((l) => (
              <tr key={l.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                <td className="py-2.5">
                  <div className="font-medium">{l.nome ?? "Sem nome"}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{l.categoria}</div>
                </td>
                <td><StatusBadge status={l.status} /></td>
                <td className="py-2.5 font-mono text-xs">
                  {l.os_concluidas} / {l.total_os}
                  {l.os_com_erro > 0 && <span className="ml-2 text-rose-300">({l.os_com_erro} erro)</span>}
                </td>
                <td className="py-2.5 text-xs text-muted-foreground">{fmt(l.criado_em)}</td>
                <td className="py-2.5 text-right">
                  <Sheet open={openLote?.id === l.id} onOpenChange={(o) => setOpenLote(o ? l : null)}>
                    <SheetTrigger asChild>
                      <button className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] transition hover:bg-white/10 active:scale-95">
                        Ver log
                      </button>
                    </SheetTrigger>
                    {openLote?.id === l.id && <LogDrawer lote={openLote} />}
                  </Sheet>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

function LogDrawer({ lote }: { lote: Lote }) {
  const { data: logs = [] } = useLogs(lote.id);
  const { data: itens = [] } = useOsItens(lote.id);

  return (
    <SheetContent side="right" className="w-full overflow-y-auto border-white/10 bg-[#0A0A0C]/95 backdrop-blur-2xl sm:max-w-xl">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2 font-display tracking-tight">
          <Terminal className="h-4 w-4" /> {lote.nome ?? "Sem nome"}
        </SheetTitle>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <StatusBadge status={lote.status} />
          <span>{itens.length} OS · {lote.os_concluidas} concluídas · {lote.os_com_erro} erros</span>
        </div>
      </SheetHeader>

      <div className="mt-4">
        <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">OS</h4>
        <div className="max-h-[220px] overflow-y-auto rounded-2xl border border-white/5 bg-white/[0.02] p-2">
          {itens.map((i) => (
            <div key={i.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs">
              {i.status === "concluido" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              ) : i.status === "erro" ? (
                <XCircle className="h-3.5 w-3.5 text-rose-400" />
              ) : i.status === "em_execucao" ? (
                <Circle className="h-3.5 w-3.5 animate-pulse text-blue-400" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />
              )}
              <span className="font-mono">{i.numero_os}</span>
              {i.mensagem_erro && <span className="ml-auto truncate text-rose-300/80">{i.mensagem_erro}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Log</h4>
        <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-white/5 bg-black/40 p-3 font-mono text-[11px]">
          {logs.length === 0 && (
            <p className="text-muted-foreground">Nenhum log ainda. Aguarde a extensão executar.</p>
          )}
          {logs.map((log) => (
            <div key={log.id} className="mb-1 flex gap-2">
              <span className="shrink-0 text-muted-foreground">{fmtTime(log.criado_em)}</span>
              <span
                className={cn(
                  "shrink-0 uppercase",
                  log.status === "erro"
                    ? "text-rose-300"
                    : log.status === "sucesso"
                      ? "text-emerald-300"
                      : "text-blue-300",
                )}
              >
                {log.status === "erro" ? <X className="inline h-3 w-3" /> : "•"} {log.etapa}
              </span>
              <span className="text-foreground/80">{log.mensagem}</span>
            </div>
          ))}
        </div>
      </div>
    </SheetContent>
  );
}
