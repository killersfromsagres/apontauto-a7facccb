import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Loader2, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { uploadPhotoWithFallback } from "@/lib/photo-upload";
import {
  FILTRO_PRIORIDADE_LABEL,
  FILTRO_SITUACAO_LABEL,
  atualizarFiltro,
  type FiltroSituacao,
  type FiltroSolicitacao,
} from "@/lib/agua/api";
import {
  EVENTO_LABEL,
  cancelarSolicitacao,
  comentarSolicitacao,
  concluirSolicitacao,
  estadoSla,
  listFiltroEventos,
} from "@/lib/agua/filtros";

interface Props {
  solicitacao: FiltroSolicitacao | null;
  titulo: string;
  podeEscrever: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FiltroDetalheDialog({ solicitacao, titulo, podeEscrever, onOpenChange }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [comentario, setComentario] = useState("");
  const [obsConclusao, setObsConclusao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  const id = solicitacao?.id ?? "";

  const eventos = useQuery({
    queryKey: ["agua", "filtro-eventos", id],
    queryFn: () => listFiltroEventos(id),
    enabled: Boolean(id),
  });

  function invalidar() {
    void qc.invalidateQueries({ queryKey: ["agua", "filtros"] });
    void qc.invalidateQueries({ queryKey: ["agua", "filtro-eventos", id] });
    void qc.invalidateQueries({ queryKey: ["agua", "filtro-ativos"] });
  }

  const comentar = useMutation({
    mutationFn: () => comentarSolicitacao(id, comentario),
    onSuccess: () => {
      setComentario("");
      invalidar();
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha ao comentar."),
  });

  const mudar = useMutation({
    mutationFn: (situacao: FiltroSituacao) => atualizarFiltro(id, { situacao }),
    onSuccess: () => invalidar(),
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha ao atualizar."),
  });

  const cancelar = useMutation({
    mutationFn: () => cancelarSolicitacao(id, motivo),
    onSuccess: () => {
      setMotivo("");
      toast.success("Solicitação cancelada.");
      invalidar();
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Falha ao cancelar."),
  });

  async function concluirComFoto(file: File) {
    setEnviando(true);
    try {
      const { url } = await enviarEvidencia(
        file,
        { filtroSolicitacaoId: id, tipo: "filtro" },
        { nome: `filtro-${id}` },
      );
      if (!url) {
        throw new Error(
          "Foto salva no aparelho aguardando envio. Tente concluir novamente quando houver rede.",
        );
      }

      await concluirSolicitacao(id, { foto_url: url, observacao: obsConclusao });
      toast.success("Solicitação concluída com evidência.");
      setObsConclusao("");
      invalidar();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao concluir.");
    } finally {
      setEnviando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const sla = solicitacao ? estadoSla(solicitacao) : null;
  const encerrada =
    solicitacao?.situacao === "concluida" || solicitacao?.situacao === "cancelada";

  return (
    <Dialog open={Boolean(solicitacao)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            {solicitacao?.numero ? `#${solicitacao.numero} · ` : ""}
            {titulo}
          </DialogTitle>
        </DialogHeader>

        {solicitacao && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full border border-border/60 px-2 py-0.5">
                {solicitacao.tipo}
              </span>
              <span className="rounded-full border border-border/60 px-2 py-0.5">
                {FILTRO_PRIORIDADE_LABEL[solicitacao.prioridade]}
              </span>
              <span className="rounded-full border border-border/60 px-2 py-0.5">
                {FILTRO_SITUACAO_LABEL[solicitacao.situacao]}
              </span>
              <span className="rounded-full border border-border/60 px-2 py-0.5">
                origem: {solicitacao.origem}
              </span>
              {sla && sla.estado !== "encerrado" && (
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5",
                    sla.estado === "vencido"
                      ? "border-rose-400/40 text-rose-300"
                      : sla.estado === "atencao"
                        ? "border-amber-400/40 text-amber-300"
                        : "border-emerald-400/40 text-emerald-300",
                  )}
                >
                  {sla.estado === "vencido"
                    ? `SLA vencido há ${Math.abs(Math.round(sla.horasRestantes))}h`
                    : `SLA em ${Math.round(sla.horasRestantes)}h`}
                </span>
              )}
            </div>

            {solicitacao.descricao && <p className="text-sm">{solicitacao.descricao}</p>}

            {solicitacao.foto_conclusao_url && (
              <a
                href={solicitacao.foto_conclusao_url}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-2xl border border-border/50"
              >
                <img
                  src={solicitacao.foto_conclusao_url}
                  alt="Evidência da conclusão"
                  loading="lazy"
                  className="h-40 w-full object-cover"
                />
              </a>
            )}

            {podeEscrever && !encerrada && (
              <div className="space-y-3 rounded-2xl border border-border/50 bg-card/40 p-3">
                {solicitacao.situacao === "aberta" && (
                  <Button
                    variant="secondary"
                    className="min-h-[44px] w-full"
                    disabled={mudar.isPending}
                    onClick={() => mudar.mutate("em_atendimento")}
                  >
                    Iniciar atendimento
                  </Button>
                )}

                <div className="space-y-1">
                  <Label htmlFor="filtro-obs-concl">Observação da conclusão</Label>
                  <Textarea
                    id="filtro-obs-concl"
                    rows={2}
                    value={obsConclusao}
                    onChange={(e) => setObsConclusao(e.target.value)}
                    placeholder="Ex.: refil trocado, data marcada no equipamento."
                  />
                </div>

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void concluirComFoto(f);
                  }}
                />
                <Button
                  className="min-h-[44px] w-full"
                  disabled={enviando}
                  onClick={() => fileRef.current?.click()}
                >
                  {enviando ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="mr-2 h-4 w-4" />
                  )}
                  Concluir com foto
                </Button>

                <div className="space-y-1">
                  <Label htmlFor="filtro-motivo">Cancelar (motivo obrigatório)</Label>
                  <Textarea
                    id="filtro-motivo"
                    rows={2}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    className="min-h-[40px] w-full text-rose-300"
                    disabled={!motivo.trim() || cancelar.isPending}
                    onClick={() => cancelar.mutate()}
                  >
                    Cancelar solicitação
                  </Button>
                </div>
              </div>
            )}

            {podeEscrever && (
              <div className="space-y-2">
                <Label htmlFor="filtro-comentario">Comentário</Label>
                <Textarea
                  id="filtro-comentario"
                  rows={2}
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                />
                <Button
                  variant="secondary"
                  className="min-h-[40px]"
                  disabled={!comentario.trim() || comentar.isPending}
                  onClick={() => comentar.mutate()}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Adicionar à trilha
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Trilha de eventos</p>
              {eventos.isLoading ? (
                <Skeleton className="h-16 rounded-2xl" />
              ) : (
                <ol className="space-y-2 border-l border-border/50 pl-3">
                  {(eventos.data ?? []).map((ev) => (
                    <li key={ev.id} className="text-xs">
                      <p className="font-medium">{EVENTO_LABEL[ev.tipo]}</p>
                      <p className="text-muted-foreground">
                        {new Date(ev.criado_em).toLocaleString("pt-BR")}
                        {ev.situacao_anterior
                          ? ` · ${ev.situacao_anterior} → ${ev.situacao_nova}`
                          : ""}
                      </p>
                      {ev.comentario && <p className="mt-0.5">{ev.comentario}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
