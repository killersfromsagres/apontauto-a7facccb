import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, CheckCircle2, Loader2, MessageSquare, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SignaturePad } from "@/components/corretiva/signature-pad";
import { cn } from "@/lib/utils";
import { enviarEvidencia } from "@/features/water-delivery/offline/fotos";
import {
  FILTRO_PRIORIDADE_LABEL,
  FILTRO_SITUACAO_LABEL,
  type FiltroSituacao,
  type FiltroSolicitacao,
} from "@/features/water-delivery/queries/api";
import {
  CONDICOES,
  EVENTO_LABEL,
  MOTIVO_LABEL,
  SITUACOES_ENCERRADAS,
  TRANSICOES,
  calcularProximaTroca,
  cancelarSolicitacao,
  comentarSolicitacao,
  concluirTroca,
  estadoSla,
  listFiltroEventos,
  mudarSituacao,
  programarTroca,
  reabrirSolicitacao,
  rejeitarSolicitacao,
  validarPeloSolicitante,
  type FiltroAtivo,
  type FiltroCondicao,
} from "@/features/water-delivery/filters/filtros";

interface Props {
  solicitacao: FiltroSolicitacao | null;
  titulo: string;
  podeEscrever: boolean;
  ativo?: FiltroAtivo | null;
  onOpenChange: (open: boolean) => void;
}

async function dataUrlParaBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export function FiltroDetalheDialog({
  solicitacao,
  titulo,
  podeEscrever,
  ativo,
  onOpenChange,
}: Props) {
  const qc = useQueryClient();
  const fotoRef = useRef<HTMLInputElement>(null);
  const [alvoFoto, setAlvoFoto] = useState<"antes" | "depois">("antes");
  const [enviando, setEnviando] = useState(false);

  const [comentario, setComentario] = useState("");
  const [motivo, setMotivo] = useState("");
  const [aba, setAba] = useState<"fluxo" | "programacao" | "conclusao">("fluxo");

  // 12.4
  const [prog, setProg] = useState({
    responsavel: "",
    responsavel2: "",
    quando: "",
    material: "",
    quantidade: "1",
    reservar: false,
    naRota: false,
    lembrete: "",
    observacao: "",
  });

  // 12.5
  const [concl, setConcl] = useState({
    fotoAntes: "" as string,
    fotoDepois: "" as string,
    filtro: "",
    lote: "",
    quantidade: "1",
    colaborador: "",
    observacao: "",
    descarte: "",
    condicao: "boa" as FiltroCondicao,
    proxima: "",
    assinatura: null as string | null,
  });

  const [nota, setNota] = useState(0);

  const id = solicitacao?.id ?? "";
  const situacao = solicitacao?.situacao ?? "solicitada";

  const eventos = useQuery({
    queryKey: ["agua", "filtro-eventos", id],
    queryFn: () => listFiltroEventos(id),
    enabled: Boolean(id),
  });

  function invalidar() {
    void qc.invalidateQueries({ queryKey: ["agua", "filtros"] });
    void qc.invalidateQueries({ queryKey: ["agua", "filtro-eventos", id] });
    void qc.invalidateQueries({ queryKey: ["agua", "filtro-ativos"] });
    void qc.invalidateQueries({ queryKey: ["agua", "filtro-preventivas"] });
  }

  const erro = (e: unknown) => toast.error((e as Error)?.message ?? "Falha na operação.");

  const comentar = useMutation({
    mutationFn: () => comentarSolicitacao(id, comentario),
    onSuccess: () => {
      setComentario("");
      invalidar();
    },
    onError: erro,
  });

  const avancar = useMutation({
    mutationFn: (para: FiltroSituacao) => mudarSituacao(id, situacao, para),
    onSuccess: () => invalidar(),
    onError: erro,
  });

  const rejeitar = useMutation({
    mutationFn: () => rejeitarSolicitacao(id, motivo),
    onSuccess: () => {
      setMotivo("");
      toast.success("Solicitação rejeitada.");
      invalidar();
    },
    onError: erro,
  });

  const cancelar = useMutation({
    mutationFn: () => cancelarSolicitacao(id, motivo),
    onSuccess: () => {
      setMotivo("");
      toast.success("Solicitação cancelada.");
      invalidar();
    },
    onError: erro,
  });

  const reabrir = useMutation({
    mutationFn: () => reabrirSolicitacao(id, motivo),
    onSuccess: () => {
      setMotivo("");
      toast.success("Solicitação reaberta.");
      invalidar();
    },
    onError: erro,
  });

  const programar = useMutation({
    mutationFn: () =>
      programarTroca(id, {
        responsavel_nome: prog.responsavel,
        responsavel_2_nome: prog.responsavel2,
        programada_em: prog.quando,
        material_descricao: prog.material,
        material_quantidade: Number(prog.quantidade) || null,
        material_reservado: prog.reservar,
        incluir_na_rota: prog.naRota,
        lembrete_em: prog.lembrete || null,
        observacao_programacao: prog.observacao,
      }),
    onSuccess: () => {
      toast.success("Troca programada.");
      setAba("fluxo");
      invalidar();
    },
    onError: erro,
  });

  const concluir = useMutation({
    mutationFn: async () => {
      let assinaturaUrl: string | null = null;
      if (concl.assinatura) {
        const blob = await dataUrlParaBlob(concl.assinatura);
        const { url } = await enviarEvidencia(
          blob,
          { filtroSolicitacaoId: id, tipo: "filtro" },
          { nome: `assinatura-${id}` },
        );
        assinaturaUrl = url;
      }
      await concluirTroca(id, {
        ativo_id: solicitacao?.ativo_id ?? null,
        foto_antes_url: concl.fotoAntes,
        foto_depois_url: concl.fotoDepois,
        filtro_utilizado: concl.filtro,
        lote: concl.lote,
        quantidade: Number(concl.quantidade) || 1,
        colaborador: concl.colaborador,
        observacao: concl.observacao,
        descarte_destino: concl.descarte,
        condicao_apos: concl.condicao,
        nova_proxima_troca:
          concl.proxima ||
          (ativo
            ? calcularProximaTroca(new Date().toISOString().slice(0, 10), ativo.periodicidade_dias)
            : null),
        assinatura_url: assinaturaUrl,
      });
    },
    onSuccess: () => {
      toast.success("Troca concluída com evidências.");
      setAba("fluxo");
      invalidar();
    },
    onError: erro,
  });

  const validar = useMutation({
    mutationFn: () => validarPeloSolicitante(id, { nota: nota || null, comentario }),
    onSuccess: () => {
      setComentario("");
      setNota(0);
      toast.success("Atendimento validado. Obrigado pela avaliação!");
      invalidar();
    },
    onError: erro,
  });

  async function capturarFoto(file: File) {
    setEnviando(true);
    try {
      const { url } = await enviarEvidencia(
        file,
        { filtroSolicitacaoId: id, tipo: "filtro" },
        { nome: `filtro-${alvoFoto}-${id}` },
      );
      if (!url) throw new Error("Sem rede: a foto ficou na fila. Tente novamente com conexão.");
      setConcl((c) =>
        alvoFoto === "antes" ? { ...c, fotoAntes: url } : { ...c, fotoDepois: url },
      );
    } catch (e) {
      erro(e);
    } finally {
      setEnviando(false);
      if (fotoRef.current) fotoRef.current.value = "";
    }
  }

  const sla = solicitacao ? estadoSla(solicitacao) : null;
  const encerrada = SITUACOES_ENCERRADAS.includes(situacao);
  const proximos = (TRANSICOES[situacao] ?? []).filter(
    (s) => !["rejeitada", "cancelada", "programada", "concluida", "reaberta"].includes(s),
  );

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
              <span className="rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 text-primary">
                {FILTRO_SITUACAO_LABEL[situacao]}
              </span>
              <span className="rounded-full border border-border/60 px-2 py-0.5">
                origem: {solicitacao.origem}
              </span>
              {solicitacao.reaberturas > 0 && (
                <span className="rounded-full border border-amber-400/40 px-2 py-0.5 text-amber-300">
                  {solicitacao.reaberturas}x reaberta
                </span>
              )}
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

            <div className="rounded-2xl border border-border/50 bg-card/40 p-3 text-xs">
              <p className="text-muted-foreground">
                {[solicitacao.predio, solicitacao.andar_setor, solicitacao.espaco]
                  .filter(Boolean)
                  .join(" · ") || "Local não detalhado"}
              </p>
              {solicitacao.solicitante_nome && (
                <p className="mt-1">
                  Solicitante: {solicitacao.solicitante_nome}
                  {solicitacao.telefone ? ` · ${solicitacao.telefone}` : ""}
                </p>
              )}
              {solicitacao.disponibilidade_acesso && (
                <p className="mt-0.5">Acesso: {solicitacao.disponibilidade_acesso}</p>
              )}
              {solicitacao.os_relacionada && (
                <p className="mt-0.5">OS: {solicitacao.os_relacionada}</p>
              )}
              {solicitacao.motivos?.length > 0 && (
                <p className="mt-1">
                  Motivos: {solicitacao.motivos.map((m) => MOTIVO_LABEL[m] ?? m).join(", ")}
                  {solicitacao.motivo_outro ? ` — ${solicitacao.motivo_outro}` : ""}
                </p>
              )}
              {solicitacao.responsavel_nome && (
                <p className="mt-1">
                  Responsável: {solicitacao.responsavel_nome}
                  {solicitacao.responsavel_2_nome ? ` + ${solicitacao.responsavel_2_nome}` : ""}
                  {solicitacao.programada_em
                    ? ` · ${new Date(solicitacao.programada_em).toLocaleString("pt-BR")}`
                    : ""}
                </p>
              )}
            </div>

            {solicitacao.descricao && <p className="text-sm">{solicitacao.descricao}</p>}

            <div className="grid grid-cols-2 gap-2">
              {[solicitacao.foto_url, solicitacao.foto_antes_url, solicitacao.foto_depois_url]
                .filter(Boolean)
                .map((url, i) => (
                  <a
                    key={`${url}-${i}`}
                    href={url as string}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-2xl border border-border/50"
                  >
                    <img
                      src={url as string}
                      alt="Evidência da solicitação"
                      loading="lazy"
                      className="h-28 w-full object-cover"
                    />
                  </a>
                ))}
            </div>

            {podeEscrever && !encerrada && (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
                {(
                  [
                    ["fluxo", "Fluxo"],
                    ["programacao", "Programar"],
                    ["conclusao", "Concluir"],
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
            )}

            {podeEscrever && !encerrada && aba === "fluxo" && (
              <div className="space-y-3 rounded-2xl border border-border/50 bg-card/40 p-3">
                <div className="flex flex-wrap gap-2">
                  {proximos.map((s) => (
                    <Button
                      key={s}
                      variant="secondary"
                      className="min-h-[44px]"
                      loading={avancar.isPending}
                      onClick={() => avancar.mutate(s)}
                    >
                      {FILTRO_SITUACAO_LABEL[s]}
                    </Button>
                  ))}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="filtro-motivo">Motivo (rejeição/cancelamento)</Label>
                  <Textarea
                    id="filtro-motivo"
                    rows={2}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      className="min-h-[40px] text-amber-300"
                      disabled={!motivo.trim() || rejeitar.isPending}
                      onClick={() => rejeitar.mutate()}
                    >
                      Rejeitar
                    </Button>
                    <Button
                      variant="ghost"
                      className="min-h-[40px] text-rose-300"
                      disabled={!motivo.trim() || cancelar.isPending}
                      onClick={() => cancelar.mutate()}
                    >
                      Cancelar solicitação
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {podeEscrever && !encerrada && aba === "programacao" && (
              <div className="space-y-3 rounded-2xl border border-border/50 bg-card/40 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="prog-resp">Responsável</Label>
                    <Input
                      id="prog-resp"
                      value={prog.responsavel}
                      onChange={(e) => setProg((p) => ({ ...p, responsavel: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="prog-resp2">2º colaborador (opcional)</Label>
                    <Input
                      id="prog-resp2"
                      value={prog.responsavel2}
                      onChange={(e) => setProg((p) => ({ ...p, responsavel2: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="prog-quando">Data e horário</Label>
                    <Input
                      id="prog-quando"
                      type="datetime-local"
                      value={prog.quando}
                      onChange={(e) => setProg((p) => ({ ...p, quando: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="prog-lembrete">Lembrete</Label>
                    <Input
                      id="prog-lembrete"
                      type="datetime-local"
                      value={prog.lembrete}
                      onChange={(e) => setProg((p) => ({ ...p, lembrete: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="prog-mat">Material / filtro necessário</Label>
                    <Input
                      id="prog-mat"
                      value={prog.material}
                      onChange={(e) => setProg((p) => ({ ...p, material: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="prog-qtd">Quantidade</Label>
                    <Input
                      id="prog-qtd"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={prog.quantidade}
                      onChange={(e) => setProg((p) => ({ ...p, quantidade: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-xs">
                  <label className="flex min-h-[40px] items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={prog.reservar}
                      onChange={(e) => setProg((p) => ({ ...p, reservar: e.target.checked }))}
                    />
                    Reservar material
                  </label>
                  <label className="flex min-h-[40px] items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={prog.naRota}
                      onChange={(e) => setProg((p) => ({ ...p, naRota: e.target.checked }))}
                    />
                    Incluir na rota de entrega de água
                  </label>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="prog-obs">Observação</Label>
                  <Textarea
                    id="prog-obs"
                    rows={2}
                    value={prog.observacao}
                    onChange={(e) => setProg((p) => ({ ...p, observacao: e.target.value }))}
                  />
                </div>

                <Button
                  className="min-h-[44px] w-full"
                  loading={programar.isPending}
                  onClick={() => programar.mutate()}
                >
                  {programar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Programar troca
                </Button>
              </div>
            )}

            {podeEscrever && !encerrada && aba === "conclusao" && (
              <div className="space-y-3 rounded-2xl border border-border/50 bg-card/40 p-3">
                <input
                  ref={fotoRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void capturarFoto(f);
                  }}
                />
                <div className="grid grid-cols-2 gap-2">
                  {(["antes", "depois"] as const).map((k) => {
                    const url = k === "antes" ? concl.fotoAntes : concl.fotoDepois;
                    return (
                      <button
                        key={k}
                        type="button"
                        disabled={enviando}
                        onClick={() => {
                          setAlvoFoto(k);
                          fotoRef.current?.click();
                        }}
                        className={cn(
                          "flex min-h-[96px] flex-col items-center justify-center gap-1 rounded-2xl border text-xs",
                          url
                            ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
                            : "border-dashed border-border/60 text-muted-foreground",
                        )}
                      >
                        {url ? (
                          <img
                            src={url}
                            alt={`Foto ${k}`}
                            className="h-16 w-full rounded-xl object-cover"
                          />
                        ) : enviando && alvoFoto === k ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Camera className="h-5 w-5" />
                        )}
                        Foto {k}
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="con-filtro">Filtro utilizado</Label>
                    <Input
                      id="con-filtro"
                      value={concl.filtro}
                      onChange={(e) => setConcl((c) => ({ ...c, filtro: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="con-lote">Lote (opcional)</Label>
                    <Input
                      id="con-lote"
                      value={concl.lote}
                      onChange={(e) => setConcl((c) => ({ ...c, lote: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="con-qtd">Quantidade</Label>
                    <Input
                      id="con-qtd"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={concl.quantidade}
                      onChange={(e) => setConcl((c) => ({ ...c, quantidade: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="con-colab">Colaborador</Label>
                    <Input
                      id="con-colab"
                      value={concl.colaborador}
                      onChange={(e) => setConcl((c) => ({ ...c, colaborador: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="con-descarte">Descarte do filtro antigo</Label>
                    <Input
                      id="con-descarte"
                      value={concl.descarte}
                      onChange={(e) => setConcl((c) => ({ ...c, descarte: e.target.value }))}
                      placeholder="Ex.: coleta reciclável do prédio"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Condição após o serviço</Label>
                    <Select
                      value={concl.condicao}
                      onValueChange={(v) =>
                        setConcl((c) => ({ ...c, condicao: v as FiltroCondicao }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDICOES.map((c) => (
                          <SelectItem key={c.valor} value={c.valor}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="con-prox">Nova troca prevista</Label>
                    <Input
                      id="con-prox"
                      type="date"
                      value={concl.proxima}
                      onChange={(e) => setConcl((c) => ({ ...c, proxima: e.target.value }))}
                    />
                    {ativo && !concl.proxima && (
                      <p className="text-[11px] text-muted-foreground">
                        Em branco, o sistema calcula {ativo.periodicidade_dias} dias a partir de
                        hoje.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="con-obs">Observação</Label>
                  <Textarea
                    id="con-obs"
                    rows={2}
                    value={concl.observacao}
                    onChange={(e) => setConcl((c) => ({ ...c, observacao: e.target.value }))}
                  />
                </div>

                <div className="space-y-1">
                  <Label>Confirmação do solicitante (opcional)</Label>
                  <SignaturePad
                    value={concl.assinatura}
                    onChange={(v) => setConcl((c) => ({ ...c, assinatura: v }))}
                  />
                </div>

                <Button
                  className="min-h-[44px] w-full"
                  loading={concluir.isPending}
                  onClick={() => concluir.mutate()}
                >
                  {concluir.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Concluir troca
                </Button>
              </div>
            )}

            {situacao === "concluida" && (
              <div className="space-y-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/5 p-3">
                <Label>Como foi o atendimento?</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-label={`Nota ${n}`}
                      onClick={() => setNota(n)}
                      className="min-h-[40px] px-1"
                    >
                      <Star
                        className={cn(
                          "h-6 w-6",
                          n <= nota ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
                        )}
                      />
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="min-h-[44px]"
                    loading={validar.isPending}
                    onClick={() => validar.mutate()}
                  >
                    Validar conclusão
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-[44px] text-amber-300"
                    disabled={!motivo.trim() || reabrir.isPending}
                    onClick={() => reabrir.mutate()}
                  >
                    Reabrir
                  </Button>
                </div>
                <Textarea
                  rows={2}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Motivo da reabertura (se o problema persistir)"
                />
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
