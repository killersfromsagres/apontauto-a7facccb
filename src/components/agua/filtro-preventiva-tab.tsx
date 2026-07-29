import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, CalendarPlus, Loader2 } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, KpiCard } from "@/components/pcm";
import { cn } from "@/lib/utils";
import { listPontos, pontoLabel, type Ponto } from "@/lib/agua/api";
import {
  abrirSolicitacaoPreventiva,
  diasParaTroca,
  gerarAgendaPreventiva,
  listFiltroAtivos,
  listPreventivas,
  reagendarPreventiva,
  statusPreventivo,
  type FiltroPreventiva,
} from "@/lib/agua/filtros";

/** 12.6 — agenda preventiva de troca de filtros. */
export function FiltroPreventivaTab({ podeEscrever }: { podeEscrever: boolean }) {
  const qc = useQueryClient();
  const [alertaDias, setAlertaDias] = useState(30);
  const [reagendando, setReagendando] = useState<FiltroPreventiva | null>(null);
  const [novaData, setNovaData] = useState("");
  const [justificativa, setJustificativa] = useState("");

  const ativos = useQuery({ queryKey: ["agua", "filtro-ativos"], queryFn: listFiltroAtivos });
  const preventivas = useQuery({
    queryKey: ["agua", "filtro-preventivas"],
    queryFn: listPreventivas,
  });
  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });

  const porPonto = useMemo(
    () => new Map((pontos.data ?? []).map((p: Ponto) => [p.id, p])),
    [pontos.data],
  );
  const porAtivo = useMemo(
    () => new Map((ativos.data ?? []).map((a) => [a.id, a])),
    [ativos.data],
  );

  const resumo = useMemo(() => {
    const base = (ativos.data ?? []).filter((a) => a.situacao === "ativo");
    const cont = { vencido: 0, vencendo: 0, em_dia: 0, sem_data: 0 };
    for (const a of base) cont[statusPreventivo(a, alertaDias)] += 1;
    return { ...cont, total: base.length };
  }, [ativos.data, alertaDias]);

  /** Indicadores por prédio (12.6). */
  const porPredio = useMemo(() => {
    const mapa = new Map<string, { vencidos: number; vencendo: number; total: number }>();
    for (const a of ativos.data ?? []) {
      if (a.situacao !== "ativo") continue;
      const ponto = porPonto.get(a.ponto_id);
      const chave = a.predio || (ponto ? pontoLabel(ponto) : "Sem prédio");
      const item = mapa.get(chave) ?? { vencidos: 0, vencendo: 0, total: 0 };
      const st = statusPreventivo(a, alertaDias);
      item.total += 1;
      if (st === "vencido") item.vencidos += 1;
      if (st === "vencendo") item.vencendo += 1;
      mapa.set(chave, item);
    }
    return [...mapa.entries()].sort((a, b) => b[1].vencidos - a[1].vencidos).slice(0, 8);
  }, [ativos.data, porPonto, alertaDias]);

  const gerar = useMutation({
    mutationFn: () => gerarAgendaPreventiva(ativos.data ?? [], preventivas.data ?? [], 60),
    onSuccess: (n) => {
      toast[n ? "success" : "info"](
        n ? `${n} tarefa(s) preventiva(s) criada(s).` : "Agenda já está em dia.",
      );
      void qc.invalidateQueries({ queryKey: ["agua", "filtro-preventivas"] });
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha ao gerar agenda."),
  });

  const abrirOs = useMutation({
    mutationFn: (p: FiltroPreventiva) => {
      const ativo = porAtivo.get(p.ativo_id);
      if (!ativo) throw new Error("Ativo não encontrado.");
      return abrirSolicitacaoPreventiva(p, ativo);
    },
    onSuccess: () => {
      toast.success("Solicitação de troca aberta.");
      void qc.invalidateQueries({ queryKey: ["agua", "filtros"] });
      void qc.invalidateQueries({ queryKey: ["agua", "filtro-preventivas"] });
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha ao abrir a tarefa."),
  });

  const reagendar = useMutation({
    mutationFn: () => reagendarPreventiva(reagendando!, novaData, justificativa),
    onSuccess: () => {
      toast.success("Preventiva reagendada com justificativa.");
      setReagendando(null);
      setNovaData("");
      setJustificativa("");
      void qc.invalidateQueries({ queryKey: ["agua", "filtro-preventivas"] });
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha ao reagendar."),
  });

  const lista = (preventivas.data ?? []).filter((p) => p.status !== "cancelado");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Filtros ativos" value={resumo.total} icon={<CalendarClock className="h-4 w-4" />} />
        <KpiCard label="Vencidos" value={resumo.vencido} icon={<CalendarClock className="h-4 w-4" />} />
        <KpiCard
          label={`Vencendo (${alertaDias}d)`}
          value={resumo.vencendo}
          icon={<CalendarClock className="h-4 w-4" />}
        />
        <KpiCard label="Sem data-base" value={resumo.sem_data} icon={<CalendarClock className="h-4 w-4" />} />
      </div>

      <GlassCard className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="space-y-1 sm:max-w-[200px]">
          <Label htmlFor="prev-alerta">Alerta de vencimento (dias)</Label>
          <Input
            id="prev-alerta"
            type="number"
            inputMode="numeric"
            min={1}
            value={alertaDias}
            onChange={(e) => setAlertaDias(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
        {podeEscrever && (
          <Button
            className="min-h-[44px] sm:ml-auto"
            disabled={gerar.isPending}
            onClick={() => gerar.mutate()}
          >
            {gerar.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CalendarPlus className="mr-2 h-4 w-4" />
            )}
            Gerar tarefas automáticas
          </Button>
        )}
      </GlassCard>

      {porPredio.length > 0 && (
        <GlassCard className="space-y-2 p-4">
          <p className="text-xs font-semibold text-muted-foreground">Indicadores por prédio</p>
          {porPredio.map(([predio, i]) => (
            <div key={predio} className="flex items-center justify-between text-xs">
              <span className="truncate pr-2">{predio}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {i.total} filtros · <span className="text-rose-300">{i.vencidos} vencidos</span> ·{" "}
                <span className="text-amber-300">{i.vencendo} vencendo</span>
              </span>
            </div>
          ))}
        </GlassCard>
      )}

      {preventivas.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <EmptyState
          title="Nenhuma preventiva agendada"
          description="Gere as tarefas automáticas a partir da periodicidade cadastrada nos filtros."
        />
      ) : (
        <div className="space-y-2">
          {lista.map((p) => {
            const ativo = porAtivo.get(p.ativo_id);
            const ponto = ativo ? porPonto.get(ativo.ponto_id) : null;
            const dias = ativo ? diasParaTroca({ proxima_troca: p.prevista_para }) : null;
            const tom =
              p.status === "concluido"
                ? "border-emerald-400/40 bg-emerald-500/5"
                : dias !== null && dias < 0
                  ? "border-rose-400/40 bg-rose-500/5"
                  : dias !== null && dias <= alertaDias
                    ? "border-amber-400/40 bg-amber-500/5"
                    : "border-border/50 bg-card/40";
            return (
              <div key={p.id} className={cn("space-y-2 rounded-2xl border p-3", tom)}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {ativo?.predio || (ponto ? pontoLabel(ponto) : "Ativo removido")}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[ativo?.codigo, ativo?.tipo_equipamento, ativo?.modelo_elemento, ativo?.tipo_filtro]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Prevista para {p.prevista_para.split("-").reverse().join("/")}
                      {p.reagendada_de
                        ? ` (era ${p.reagendada_de.split("-").reverse().join("/")})`
                        : ""}
                    </p>
                    {p.justificativa && <p className="mt-0.5 text-xs">{p.justificativa}</p>}
                  </div>
                  <span className="shrink-0 self-start rounded-full border border-border/60 px-2 py-0.5 text-[11px]">
                    {p.status === "concluido"
                      ? "Concluído"
                      : dias === null
                        ? "—"
                        : dias < 0
                          ? `vencida há ${Math.abs(dias)}d`
                          : `em ${dias}d`}
                  </span>
                </div>

                {podeEscrever && p.status !== "concluido" && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="min-h-[40px]"
                      disabled={Boolean(p.solicitacao_id) || abrirOs.isPending}
                      onClick={() => abrirOs.mutate(p)}
                    >
                      {p.solicitacao_id ? "Tarefa já aberta" : "Abrir solicitação"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-[40px]"
                      onClick={() => {
                        setReagendando(p);
                        setNovaData(p.prevista_para);
                        setJustificativa("");
                      }}
                    >
                      Antecipar / adiar
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(reagendando)} onOpenChange={(o) => !o && setReagendando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Antecipar ou adiar preventiva</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="prev-data">Nova data</Label>
              <Input
                id="prev-data"
                type="date"
                value={novaData}
                onChange={(e) => setNovaData(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="prev-just">Justificativa</Label>
              <Textarea
                id="prev-just"
                rows={3}
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="min-h-[44px] w-full"
              disabled={reagendar.isPending}
              onClick={() => reagendar.mutate()}
            >
              {reagendar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar reagendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
