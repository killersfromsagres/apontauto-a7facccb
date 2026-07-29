import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Filter, Loader2, Plus } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/pcm";
import { FiltroAtivosTab } from "@/components/agua/filtro-ativos-tab";
import { FiltroDetalheDialog } from "@/components/agua/filtro-detalhe-dialog";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { cn } from "@/lib/utils";
import {
  FILTRO_PRIORIDADE_LABEL,
  FILTRO_SITUACAO_LABEL,
  FILTRO_TIPOS,
  criarFiltro,
  listFiltros,
  listPontos,
  pontoLabel,
  type FiltroPrioridade,
  type FiltroSituacao,
  type FiltroSolicitacao,
} from "@/lib/agua/api";
import { estadoSla, gerarPreventivas, listFiltroAtivos, type FiltroAtivo } from "@/lib/agua/filtros";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/filtros")({
  component: SolicitacoesFiltro,
});

const SITUACAO_TONE: Record<FiltroSituacao, string> = {
  aberta: "border-sky-400/40 bg-sky-500/10",
  em_atendimento: "border-amber-400/40 bg-amber-500/10",
  concluida: "border-emerald-400/40 bg-emerald-500/10",
  cancelada: "border-border/60 bg-muted/20",
};

const PRIORIDADE_TONE: Record<FiltroPrioridade, string> = {
  baixa: "border-border/60 text-muted-foreground",
  media: "border-amber-400/40 text-amber-300",
  alta: "border-rose-400/40 text-rose-300",
};

function SolicitacoesFiltro() {
  const qc = useQueryClient();
  const podeEscrever = useCanAccessModule("abastecimento", "update").allowed;

  const [aba, setAba] = useState<"solicitacoes" | "ativos">("solicitacoes");
  const [pontoId, setPontoId] = useState("");
  const [ativoId, setAtivoId] = useState("");
  const [tipo, setTipo] = useState(FILTRO_TIPOS[0]);
  const [prioridade, setPrioridade] = useState<FiltroPrioridade>("media");
  const [descricao, setDescricao] = useState("");
  const [prevista, setPrevista] = useState("");
  const [situacao, setSituacao] = useState<FiltroSituacao | "todas">("aberta");
  const [detalhe, setDetalhe] = useState<FiltroSolicitacao | null>(null);

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const filtros = useQuery({ queryKey: ["agua", "filtros"], queryFn: listFiltros });
  const ativos = useQuery({ queryKey: ["agua", "filtro-ativos"], queryFn: listFiltroAtivos });

  const porId = useMemo(() => new Map((pontos.data ?? []).map((p) => [p.id, p])), [pontos.data]);
  const ativosDoPonto = useMemo(
    () => (ativos.data ?? []).filter((a) => a.ponto_id === pontoId && a.situacao === "ativo"),
    [ativos.data, pontoId],
  );

  const lista = useMemo(
    () => (filtros.data ?? []).filter((f) => situacao === "todas" || f.situacao === situacao),
    [filtros.data, situacao],
  );

  const nomePonto = (id: string) => (porId.get(id) ? pontoLabel(porId.get(id)!) : "Ponto removido");

  const criar = useMutation({
    mutationFn: () =>
      criarFiltro({
        ponto_id: pontoId,
        ativo_id: ativoId || null,
        tipo,
        prioridade,
        origem: "gestor",
        descricao: descricao.trim() || null,
        prevista_para: prevista || null,
      }),
    onSuccess: () => {
      toast.success("Solicitação registrada.");
      setDescricao("");
      setPrevista("");
      setPontoId("");
      setAtivoId("");
      void qc.invalidateQueries({ queryKey: ["agua", "filtros"] });
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha ao registrar."),
  });

  const preventivas = useMutation({
    mutationFn: (todos: FiltroAtivo[]) => {
      const abertas = new Set(
        (filtros.data ?? [])
          .filter((f) => f.ativo_id && (f.situacao === "aberta" || f.situacao === "em_atendimento"))
          .map((f) => f.ativo_id as string),
      );
      return gerarPreventivas(todos, abertas, 30);
    },
    onSuccess: (n) => {
      toast[n ? "success" : "info"](
        n ? `${n} solicitação(ões) preventiva(s) aberta(s).` : "Nenhum ativo pendente na janela.",
      );
      void qc.invalidateQueries({ queryKey: ["agua", "filtros"] });
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha ao gerar preventivas."),
  });

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {(
          [
            ["solicitacoes", "Solicitações"],
            ["ativos", "Ativos de filtro"],
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

      {aba === "ativos" ? (
        <FiltroAtivosTab
          podeEscrever={podeEscrever}
          gerando={preventivas.isPending}
          onGerarPreventivas={(todos) => preventivas.mutate(todos)}
        />
      ) : (
        <>
          {podeEscrever && (
            <GlassCard className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Nova solicitação de filtro</h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1 sm:col-span-2">
                  <Label>Ponto</Label>
                  <Select
                    value={pontoId}
                    onValueChange={(v) => {
                      setPontoId(v);
                      setAtivoId("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o ponto" />
                    </SelectTrigger>
                    <SelectContent>
                      {(pontos.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {pontoLabel(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {ativosDoPonto.length > 0 && (
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Equipamento (opcional)</Label>
                    <Select value={ativoId} onValueChange={setAtivoId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Vincular a um filtro cadastrado" />
                      </SelectTrigger>
                      <SelectContent>
                        {ativosDoPonto.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {[a.codigo, a.marca, a.modelo, a.tipo_filtro].filter(Boolean).join(" · ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1">
                  <Label>Tipo</Label>
                  <Select value={tipo} onValueChange={setTipo}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FILTRO_TIPOS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Prioridade (define o SLA)</Label>
                  <Select
                    value={prioridade}
                    onValueChange={(v) => setPrioridade(v as FiltroPrioridade)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alta">Alta · 24h</SelectItem>
                      <SelectItem value="media">Média · 72h</SelectItem>
                      <SelectItem value="baixa">Baixa · 7 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="filtro-prevista">Prevista para</Label>
                  <Input
                    id="filtro-prevista"
                    type="date"
                    value={prevista}
                    onChange={(e) => setPrevista(e.target.value)}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                  <Label htmlFor="filtro-desc">Descrição</Label>
                  <Textarea
                    id="filtro-desc"
                    rows={2}
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    placeholder="Ex.: filtro saturado, vazamento na base do purificador…"
                  />
                </div>
              </div>

              <Button
                className="min-h-[44px]"
                disabled={!pontoId || criar.isPending}
                onClick={() => criar.mutate()}
              >
                {criar.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Registrar solicitação
              </Button>
            </GlassCard>
          )}

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {(["aberta", "em_atendimento", "concluida", "cancelada", "todas"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSituacao(s)}
                className={cn(
                  "min-h-[40px] shrink-0 rounded-full border px-3 text-xs font-medium",
                  situacao === s
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border/60 bg-card/40 text-muted-foreground",
                )}
              >
                {s === "todas" ? "Todas" : FILTRO_SITUACAO_LABEL[s]}
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
                          {nomePonto(f.ponto_id)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {f.tipo} · {f.origem} · aberta em{" "}
                          {new Date(f.criado_em).toLocaleDateString("pt-BR")}
                          {f.prevista_para
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
        titulo={detalhe ? nomePonto(detalhe.ponto_id) : ""}
        podeEscrever={podeEscrever}
        onOpenChange={(open) => !open && setDetalhe(null)}
      />
    </div>
  );
}
