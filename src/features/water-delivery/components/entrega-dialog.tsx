// Registro da entrega de uma parada (item 8.3) e fluxo de retificação (8.4).

import { useMemo, useState } from "react";
import { Camera, Loader2, MapPin, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SignaturePad } from "@/components/corretiva/signature-pad";
import { enviarEvidencia } from "@/features/water-delivery/offline/fotos";
import { FilaFotosAviso } from "@/features/water-delivery/components/fila-fotos-aviso";
import { cn } from "@/lib/utils";
import {
  MOTIVOS_NAO_REALIZADA,
  VISITA_STATUS_LABEL,
  pontoLabel,
  type Ponto,
  type Visita,
  type VisitaStatus,
} from "@/features/water-delivery/queries/api";
import {
  CONDICOES_PONTO,
  MOTIVOS_PARCIAL,
  STATUS_NAO_REALIZADO,
  registrarEntrega,
  retificarVisita,
  validarEntrega,
  type EntregaInput,
} from "@/features/water-delivery/mutations/execucao";

const STATUS_ESCOLHAS: VisitaStatus[] = [
  "concluida",
  "parcial",
  "sem_necessidade",
  "acesso_bloqueado",
  "local_fechado",
  "falta_bags",
  "endereco_divergente",
  "reprogramada",
  "nao_realizada",
];

export function EntregaDialog({
  aberto,
  onOpenChange,
  visita,
  ponto,
  saldoDisponivel,
  retificando,
  onSalvo,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  visita: Visita;
  ponto: Ponto;
  saldoDisponivel: number | null;
  retificando: boolean;
  onSalvo: () => void;
}) {
  const [status, setStatus] = useState<VisitaStatus>(
    visita.status === "pendente" ||
      visita.status === "em_deslocamento" ||
      visita.status === "em_atendimento"
      ? "concluida"
      : visita.status,
  );
  const [entregues, setEntregues] = useState(
    String(visita.bags_entregues ?? visita.bags_previstas),
  );
  const [recolhidas, setRecolhidas] = useState(String(visita.bags_recolhidas ?? 0));
  const [estoqueAntes, setEstoqueAntes] = useState(
    visita.estoque_antes == null ? "" : String(visita.estoque_antes),
  );
  const [estoqueDepois, setEstoqueDepois] = useState(
    visita.estoque_depois == null ? "" : String(visita.estoque_depois),
  );
  const [condicao, setCondicao] = useState(visita.condicao ?? CONDICOES_PONTO[0]);
  const [recebidoPor, setRecebidoPor] = useState(visita.recebido_por ?? "");
  const [observacao, setObservacao] = useState(visita.observacao ?? "");
  const [motivo, setMotivo] = useState(visita.motivo ?? "");
  const [fotos, setFotos] = useState<string[]>(visita.fotos ?? []);
  const [assinatura, setAssinatura] = useState<string | null>(visita.assinatura_url ?? null);
  const [confirmado, setConfirmado] = useState(visita.local_confirmado ?? false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    visita.latitude != null && visita.longitude != null
      ? { lat: visita.latitude, lng: visita.longitude }
      : null,
  );
  const [ajusteAutorizado, setAjusteAutorizado] = useState(false);
  const [motivoRetificacao, setMotivoRetificacao] = useState("");
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const naoRealizado = STATUS_NAO_REALIZADO.includes(status);
  const motivosDisponiveis = status === "parcial" ? MOTIVOS_PARCIAL : MOTIVOS_NAO_REALIZADA;

  const input: EntregaInput = useMemo(
    () => ({
      status,
      bags_entregues: naoRealizado ? 0 : Number(entregues) || 0,
      bags_recolhidas: Number(recolhidas) || 0,
      estoque_antes: estoqueAntes === "" ? null : Number(estoqueAntes),
      estoque_depois: estoqueDepois === "" ? null : Number(estoqueDepois),
      condicao,
      recebido_por: recebidoPor,
      observacao,
      motivo: status === "concluida" ? null : motivo,
      fotos,
      assinatura_url: assinatura,
      local_confirmado: confirmado,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
    }),
    [
      status,
      naoRealizado,
      entregues,
      recolhidas,
      estoqueAntes,
      estoqueDepois,
      condicao,
      recebidoPor,
      observacao,
      motivo,
      fotos,
      assinatura,
      confirmado,
      coords,
    ],
  );

  const erros = validarEntrega(input, { saldoDisponivel, ajusteAutorizado });

  async function enviarFotos(files: FileList) {
    setEnviandoFoto(true);
    try {
      const urls: string[] = [];
      let aguardando = 0;
      for (const file of Array.from(files)) {
        const res = await enviarEvidencia(
          file,
          {
            visitaId: visita.id,
            rotaId: visita.rota_id ?? null,
            pontoId: visita.ponto_id,
            tipo: "entrega",
            colaborador: visita.responsavel ?? null,
            veiculo: visita.veiculo ?? null,
            predio: ponto.predio,
            andar: ponto.andar,
            espaco: ponto.espaco,
            data: visita.data,
          },
          { nome: `agua-${visita.id}` },
        );
        if (res.duplicada && !res.url) {
          toast.info("Esta foto já foi registrada nesta parada.");
          continue;
        }
        if (res.url) urls.push(res.url);
        else aguardando += 1;
      }
      if (urls.length) setFotos((prev) => [...prev, ...urls]);
      if (aguardando) {
        toast.warning(
          `${aguardando} foto(s) aguardando envio. Ficam salvas no aparelho e sobem sozinhas quando houver rede.`,
        );
      }
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao preparar a foto.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  function capturarLocal() {
    if (!navigator.geolocation) {
      toast.error("Este aparelho não fornece geolocalização.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success("Localização registrada.");
      },
      () => toast.warning("Não foi possível obter a localização."),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function salvar() {
    if (erros.length) {
      toast.error(erros[0]);
      return;
    }
    setSalvando(true);
    try {
      if (retificando) {
        const r = await retificarVisita({
          visita,
          motivo: motivoRetificacao,
          campos: {
            status: input.status,
            bags_entregues: input.bags_entregues,
            bags_recolhidas: input.bags_recolhidas,
            estoque_antes: input.estoque_antes,
            estoque_depois: input.estoque_depois,
            condicao: input.condicao,
            recebido_por: input.recebido_por,
            observacao: input.observacao,
            motivo: input.motivo,
            fotos: input.fotos,
            assinatura_url: input.assinatura_url,
          },
        });
        toast[r.pendente ? "info" : "success"](
          r.pendente
            ? "Retificação salva no aparelho — aguardando sincronização."
            : "Retificação registrada com histórico preservado.",
        );
      } else {
        const r = await registrarEntrega(visita.id, input, {
          data: visita.data,
          atualizadoEm: (visita as { atualizado_em?: string | null }).atualizado_em ?? null,
        });
        toast[r.pendente ? "info" : "success"](
          r.pendente
            ? "Entrega concluída no aparelho — aguardando sincronização."
            : "Entrega registrada.",
        );
      }
      onSalvo();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error)?.message ?? "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{retificando ? "Retificar registro" : "Registrar entrega"}</DialogTitle>
          <DialogDescription>{pontoLabel(ponto)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Status da parada</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as VisitaStatus)}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ESCOLHAS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {VISITA_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!naoRealizado && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Quantidade entregue</Label>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className="min-h-[44px]"
                  value={entregues}
                  onChange={(e) => setEntregues(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Bags vazias recolhidas</Label>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className="min-h-[44px]"
                  value={recolhidas}
                  onChange={(e) => setRecolhidas(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Estoque visual antes</Label>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className="min-h-[44px]"
                  value={estoqueAntes}
                  onChange={(e) => setEstoqueAntes(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Estoque visual depois</Label>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className="min-h-[44px]"
                  value={estoqueDepois}
                  onChange={(e) => setEstoqueDepois(e.target.value)}
                />
              </div>
            </div>
          )}

          {status !== "concluida" && (
            <div className="space-y-1">
              <Label>Motivo</Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {motivosDisponiveis.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Condição do ponto</Label>
              <Select value={condicao} onValueChange={setCondicao}>
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDICOES_PONTO.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Recebido por (opcional)</Label>
              <Input
                className="min-h-[44px]"
                value={recebidoPor}
                onChange={(e) => setRecebidoPor(e.target.value)}
                placeholder="Nome de quem recebeu"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Observação</Label>
            <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Fotos do ponto abastecido</Label>
            <div className="flex flex-wrap gap-2">
              {fotos.map((url) => (
                <div key={url} className="relative">
                  <img
                    src={url}
                    alt="Evidência da entrega"
                    className="h-20 w-20 rounded-xl border border-border/60 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setFotos((prev) => prev.filter((f) => f !== url))}
                    className="absolute -right-2 -top-2 rounded-full border border-border/60 bg-background p-1"
                    aria-label="Remover foto"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border/60 px-3 text-sm">
                {enviandoFoto ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                Adicionar
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) void enviarFotos(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <FilaFotosAviso />
          </div>

          <div className="space-y-2">
            <Label>Assinatura simples (opcional)</Label>
            <SignaturePad value={assinatura} onChange={setAssinatura} height={140} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              className="min-h-[44px]"
              onClick={capturarLocal}
            >
              <MapPin className="mr-2 h-4 w-4" />
              {coords ? "Local registrado" : "Registrar localização"}
            </Button>
            {coords && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </span>
            )}
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-border/60 p-3 text-sm">
            <Checkbox checked={confirmado} onCheckedChange={(v) => setConfirmado(Boolean(v))} />
            <span>
              Confirmo que <strong>{ponto.predio}</strong>
              {ponto.andar ? ` · ${ponto.andar}` : ""}
              {ponto.espaco ? ` · ${ponto.espaco}` : ""} são o prédio, andar e espaço atendidos.
            </span>
          </label>

          {saldoDisponivel != null && Number(entregues) > saldoDisponivel && (
            <label className="flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm">
              <Checkbox
                checked={ajusteAutorizado}
                onCheckedChange={(v) => setAjusteAutorizado(Boolean(v))}
              />
              <span>
                Quantidade acima do saldo carregado ({saldoDisponivel}). Autorizo o ajuste com
                justificativa na observação.
              </span>
            </label>
          )}

          {retificando && (
            <div className="space-y-1">
              <Label>Motivo da retificação</Label>
              <Textarea
                rows={2}
                value={motivoRetificacao}
                onChange={(e) => setMotivoRetificacao(e.target.value)}
                placeholder="Obrigatório — o valor anterior é preservado no histórico."
              />
            </div>
          )}

          {erros.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-xs">
              {erros.map((e) => (
                <li key={e}>• {e}</li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" className="min-h-[44px]" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className={cn("min-h-[48px] flex-1 sm:flex-none")}
            disabled={salvando || erros.length > 0 || (retificando && !motivoRetificacao.trim())}
            onClick={() => void salvar()}
          >
            {salvando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 h-4 w-4" />
            )}
            {retificando ? "Salvar retificação" : "Registrar parada"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
