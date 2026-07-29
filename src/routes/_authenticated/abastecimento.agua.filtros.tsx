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
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { cn } from "@/lib/utils";
import {
  FILTRO_PRIORIDADE_LABEL,
  FILTRO_SITUACAO_LABEL,
  FILTRO_TIPOS,
  atualizarFiltro,
  criarFiltro,
  listFiltros,
  listPontos,
  pontoLabel,
  type FiltroPrioridade,
  type FiltroSituacao,
} from "@/lib/agua/api";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/filtros")({
  component: SolicitacoesFiltro,
});

const SITUACOES: FiltroSituacao[] = ["aberta", "em_atendimento", "concluida", "cancelada"];

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

  const [pontoId, setPontoId] = useState("");
  const [tipo, setTipo] = useState(FILTRO_TIPOS[0]);
  const [prioridade, setPrioridade] = useState<FiltroPrioridade>("media");
  const [descricao, setDescricao] = useState("");
  const [prevista, setPrevista] = useState("");
  const [aba, setAba] = useState<FiltroSituacao | "todas">("aberta");

  const pontos = useQuery({ queryKey: ["agua", "pontos"], queryFn: listPontos });
  const filtros = useQuery({ queryKey: ["agua", "filtros"], queryFn: listFiltros });

  const porId = useMemo(() => new Map((pontos.data ?? []).map((p) => [p.id, p])), [pontos.data]);

  const lista = useMemo(
    () => (filtros.data ?? []).filter((f) => aba === "todas" || f.situacao === aba),
    [filtros.data, aba],
  );

  const criar = useMutation({
    mutationFn: () =>
      criarFiltro({
        ponto_id: pontoId,
        tipo,
        prioridade,
        descricao: descricao.trim() || null,
        prevista_para: prevista || null,
      }),
    onSuccess: () => {
      toast.success("Solicitação registrada.");
      setDescricao("");
      setPrevista("");
      setPontoId("");
      void qc.invalidateQueries({ queryKey: ["agua", "filtros"] });
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha ao registrar."),
  });

  const mudarSituacao = useMutation({
    mutationFn: ({ id, situacao }: { id: string; situacao: FiltroSituacao }) =>
      atualizarFiltro(id, { situacao }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["agua", "filtros"] }),
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha ao atualizar."),
  });

  return (
    <div className="space-y-4">
      {podeEscrever && (
        <GlassCard className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Nova solicitação de filtro</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1 sm:col-span-2">
              <Label>Ponto</Label>
              <Select value={pontoId} onValueChange={setPontoId}>
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
              <Label>Prioridade</Label>
              <Select
                value={prioridade}
                onValueChange={(v) => setPrioridade(v as FiltroPrioridade)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["baixa", "media", "alta"] as FiltroPrioridade[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {FILTRO_PRIORIDADE_LABEL[p]}
                    </SelectItem>
                  ))}
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
            onClick={() => setAba(s)}
            className={cn(
              "min-h-[40px] shrink-0 rounded-full border px-3 text-xs font-medium",
              aba === s
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
          {lista.map((f) => (
            <div
              key={f.id}
              className={cn("space-y-2 rounded-2xl border p-3", SITUACAO_TONE[f.situacao])}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {porId.get(f.ponto_id) ? pontoLabel(porId.get(f.ponto_id)!) : "Ponto removido"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {f.tipo} · aberta em {new Date(f.criado_em).toLocaleDateString("pt-BR")}
                    {f.prevista_para
                      ? ` · prevista ${f.prevista_para.split("-").reverse().join("/")}`
                      : ""}
                  </p>
                  {f.descricao && <p className="mt-1 text-xs">{f.descricao}</p>}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[11px]",
                    PRIORIDADE_TONE[f.prioridade],
                  )}
                >
                  {FILTRO_PRIORIDADE_LABEL[f.prioridade]}
                </span>
              </div>

              {podeEscrever && (
                <div className="flex flex-wrap gap-2">
                  {SITUACOES.filter((s) => s !== f.situacao).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant="secondary"
                      className="min-h-[36px]"
                      disabled={mudarSituacao.isPending}
                      onClick={() => mudarSituacao.mutate({ id: f.id, situacao: s })}
                    >
                      {FILTRO_SITUACAO_LABEL[s]}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
