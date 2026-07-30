import { useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/pcm";
import { FiltroAtivosTab } from "@/features/water-delivery/filters/components/filtro-ativos-tab";
import { FiltroDetalheDialog } from "@/features/water-delivery/filters/components/filtro-detalhe-dialog";
import { FiltroNovaSolicitacao } from "@/features/water-delivery/filters/components/filtro-nova-solicitacao";
import { FiltroPreventivaTab } from "@/features/water-delivery/filters/components/filtro-preventiva-tab";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { cn } from "@/lib/utils";
import {
  FILTRO_PRIORIDADE_LABEL,
  FILTRO_SITUACAO_LABEL,
  listFiltros,
  listPontos,
  pontoLabel,
  type FiltroPrioridade,
  type FiltroSituacao,
  type FiltroSolicitacao,
} from "@/features/water-delivery/queries/api";
import {
  SITUACOES_ABERTAS,
  ativosReincidentes,
  estadoSla,
  listFiltroAtivos,
} from "@/features/water-delivery/filters/filtros";

const SITUACAO_TONE: Record<FiltroSituacao, string> = {
  aberta: "border-sky-400/40 bg-sky-500/10",
  solicitada: "border-sky-400/40 bg-sky-500/10",
  em_triagem: "border-sky-400/40 bg-sky-500/5",
  aprovada: "border-indigo-400/40 bg-indigo-500/10",
  rejeitada: "border-border/60 bg-muted/20",
  aguardando_material: "border-amber-400/40 bg-amber-500/5",
  programada: "border-violet-400/40 bg-violet-500/10",
  em_deslocamento: "border-amber-400/40 bg-amber-500/10",
  em_execucao: "border-amber-400/40 bg-amber-500/10",
  em_atendimento: "border-amber-400/40 bg-amber-500/10",
  concluida: "border-emerald-400/40 bg-emerald-500/10",
  validada: "border-emerald-400/50 bg-emerald-500/15",
  reaberta: "border-rose-400/40 bg-rose-500/10",
  cancelada: "border-border/60 bg-muted/20",
};

const PRIORIDADE_TONE: Record<FiltroPrioridade, string> = {
  baixa: "border-border/60 text-muted-foreground",
  media: "border-amber-400/40 text-amber-300",
  alta: "border-rose-400/40 text-rose-300",
};

const GRUPOS = [
  ["abertas", "Em aberto"],
  ["programada", "Programadas"],
  ["concluida", "Concluídas"],
  ["validada", "Validadas"],
  ["cancelada", "Encerradas"],
  ["todas", "Todas"],
] as const;

export function FilterRequestKanban() {
  const { qr } = useSearch({ from: "/_authenticated/abastecimento/agua/filtros" });
  const podeEscrever = useCanAccessModule("abastecimento", "update").allowed;

  const [aba, setAba] = useState<"solicitacoes" | "ativos" | "preventiva">("solicitacoes");
  const [grupo, setGrupo] = useState<(typeof GRUPOS)[number][0]>("abertas");
  const [detalhe, setDetalhe] = useState<FiltroSolicitacao | null>(null);

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const filtros = useQuery({ queryKey: ["agua", "filtros"], queryFn: listFiltros });
  const ativos = useQuery({ queryKey: ["agua", "filtro-ativos"], queryFn: listFiltroAtivos });

  const porId = useMemo(() => new Map((pontos.data ?? []).map((p) => [p.id, p])), [pontos.data]);
  const porAtivo = useMemo(() => new Map((ativos.data ?? []).map((a) => [a.id, a])), [ativos.data]);

  /** Abertura por QR Code do filtro (item 12.2). */
  const ativoDoQr = useMemo(
    () => (qr ? ((ativos.data ?? []).find((a) => a.qr_token === qr) ?? null) : null),
    [qr, ativos.data],
  );
  useEffect(() => {
    if (ativoDoQr) setAba("solicitacoes");
  }, [ativoDoQr]);

  const reincidentes = useMemo(() => ativosReincidentes(filtros.data ?? [], 90), [filtros.data]);

  const lista = useMemo(() => {
    const base = filtros.data ?? [];
    if (grupo === "todas") return base;
    if (grupo === "abertas") return base.filter((f) => SITUACOES_ABERTAS.includes(f.situacao));
    if (grupo === "programada")
      return base.filter((f) =>
        ["programada", "em_deslocamento", "em_execucao", "em_atendimento"].includes(f.situacao),
      );
    if (grupo === "cancelada")
      return base.filter((f) => ["cancelada", "rejeitada"].includes(f.situacao));
    return base.filter((f) => f.situacao === grupo);
  }, [filtros.data, grupo]);

  const nomePonto = (id: string) => (porId.get(id) ? pontoLabel(porId.get(id)!) : "Ponto removido");

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {(
          [
            ["solicitacoes", "Solicitações"],
            ["ativos", "Pontos de filtro"],
            ["preventiva", "Preventiva"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setAba(k)}
            className={cn(
              "min-h-[40px] shrink-0 rounded-full border px-4 text-xs font-medium",
              aba === k
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border/60 bg-card/40 text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === "ativos" && <FiltroAtivosTab podeEscrever={podeEscrever} />}
      {aba === "preventiva" && <FiltroPreventivaTab podeEscrever={podeEscrever} />}

      {aba === "solicitacoes" && (
        <>
          {ativoDoQr && (
            <p className="rounded-2xl border border-primary/40 bg-primary/10 p-3 text-xs text-primary">
              Filtro identificado por QR Code:{" "}
              {[ativoDoQr.codigo, ativoDoQr.predio, ativoDoQr.espaco].filter(Boolean).join(" · ")}
            </p>
          )}

          <FiltroNovaSolicitacao ativoInicial={ativoDoQr} />

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {GRUPOS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setGrupo(k)}
                className={cn(
                  "min-h-[40px] shrink-0 rounded-full border px-3 text-xs font-medium",
                  grupo === k
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border/60 bg-card/40 text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {filtros.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 rounded-2xl" />
              ))}
            </div>
          ) : lista.length === 0 ? (
            <EmptyState
              title="Nenhuma solicitação"
              description="Registre pedidos de troca, limpeza ou reparo de filtros por ponto."
            />
          ) : (
            <div className="space-y-2">
              {lista.map((f) => {
                const sla = estadoSla(f);
                const reincidente = f.ativo_id && reincidentes.has(f.ativo_id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setDetalhe(f)}
                    className={cn(
                      "w-full space-y-2 rounded-2xl border p-3 text-left",
                      SITUACAO_TONE[f.situacao],
                    )}
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {f.numero ? `#${f.numero} · ` : ""}
                          {f.predio || nomePonto(f.ponto_id)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {FILTRO_SITUACAO_LABEL[f.situacao]} · {f.tipo} · aberta em{" "}
                          {new Date(f.criado_em).toLocaleDateString("pt-BR")}
                          {f.programada_em
                            ? ` · troca ${new Date(f.programada_em).toLocaleString("pt-BR")}`
                            : f.prevista_para
                              ? ` · prevista ${f.prevista_para.split("-").reverse().join("/")}`
                              : ""}
                        </p>
                        {f.descricao && <p className="mt-1 line-clamp-2 text-xs">{f.descricao}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px]",
                            PRIORIDADE_TONE[f.prioridade],
                          )}
                        >
                          {FILTRO_PRIORIDADE_LABEL[f.prioridade]}
                        </span>
                        {reincidente && (
                          <span className="rounded-full border border-rose-400/50 px-2 py-0.5 text-[11px] text-rose-300">
                            reincidente
                          </span>
                        )}
                        {sla.estado !== "encerrado" && (
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[11px] tabular-nums",
                              sla.estado === "vencido"
                                ? "animate-pulse border-rose-400/50 text-rose-300"
                                : sla.estado === "atencao"
                                  ? "border-amber-400/40 text-amber-300"
                                  : "border-emerald-400/40 text-emerald-300",
                            )}
                          >
                            {Number.isFinite(sla.horasRestantes)
                              ? sla.estado === "vencido"
                                ? `-${Math.abs(Math.round(sla.horasRestantes))}h`
                                : `${Math.round(sla.horasRestantes)}h`
                              : "sem SLA"}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      <FiltroDetalheDialog
        solicitacao={detalhe}
        titulo={detalhe ? detalhe.predio || nomePonto(detalhe.ponto_id) : ""}
        podeEscrever={podeEscrever}
        ativo={detalhe?.ativo_id ? (porAtivo.get(detalhe.ativo_id) ?? null) : null}
        onOpenChange={(open) => !open && setDetalhe(null)}
      />
    </div>
  );
}
