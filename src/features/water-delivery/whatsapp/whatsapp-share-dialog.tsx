import { useEffect, useMemo, useState } from "react";
import { Copy, FileText, Loader2, MessageCircle, Send, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  agruparPorParada,
  agruparPorPredio,
  compartilharEvidencias,
  confirmarDisparo,
  copiarMensagem,
  filtrarEscopo,
  gerarPdfResumo,
  mascararTelefone,
  montarMensagem,
  registrarDisparo,
  type EscopoTipo,
  type EvidenciaItem,
  type ResumoRota,
} from "@/features/water-delivery/whatsapp/whatsapp";
import { enviarPelaCloudApi } from "@/features/water-delivery/whatsapp/whatsapp-cloud";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { useSettings } from "@/lib/settings";

const TODOS = "__todos__";

/**
 * Modo padrão do item 11: compartilhamento nativo (Web Share API) com fallback
 * por links e PDF resumido. O sistema nunca marca como "entregue" — apenas
 * registra o compartilhamento iniciado e permite a confirmação manual.
 */
export function WhatsAppShareDialog({
  aberto,
  onOpenChange,
  resumo,
  itens,
  escopoTipo = "selecao",
  escopoId,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  resumo: ResumoRota;
  itens: EvidenciaItem[];
  escopoTipo?: EscopoTipo;
  escopoId?: string | null;
}) {
  const [settings] = useSettings();
  const cfg = settings.aguaWhatsapp;
  const gestor = useCanAccessModule("abastecimento-agua", "update");

  const [escopo, setEscopo] = useState<EscopoTipo>(escopoTipo);
  const [valorEscopo, setValorEscopo] = useState<string>(TODOS);
  const [numeroSalvo, setNumeroSalvo] = useState<string>(TODOS);
  const [numeroManual, setNumeroManual] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [disparoId, setDisparoId] = useState<string | null>(null);

  useEffect(() => {
    if (aberto) {
      setEscopo(escopoTipo);
      setValorEscopo(TODOS);
      setDisparoId(null);
    }
  }, [aberto, escopoTipo]);

  const predios = useMemo(() => agruparPorPredio(itens), [itens]);
  const paradas = useMemo(() => agruparPorParada(itens), [itens]);

  const selecionados = useMemo(
    () => filtrarEscopo(itens, escopo, valorEscopo === TODOS ? null : valorEscopo),
    [itens, escopo, valorEscopo],
  );

  const usaPdf = cfg.pdfAcimaDe > 0 && selecionados.length > cfg.pdfAcimaDe;

  const mensagem = useMemo(
    () => montarMensagem(resumo, selecionados, cfg.template, { maxLinks: cfg.maxLinks }),
    [resumo, selecionados, cfg.template, cfg.maxLinks],
  );

  const numeroEfetivo =
    numeroSalvo !== TODOS ? numeroSalvo : numeroManual.replace(/\D/g, "") || null;

  async function compartilhar(preferirArquivos: boolean) {
    setEnviando(true);
    try {
      const r = await compartilharEvidencias({
        resumo,
        itens: selecionados,
        template: cfg.template,
        numero: numeroEfetivo,
        preferirArquivos,
        maxLinks: cfg.maxLinks,
        pdfAcimaDe: cfg.pdfAcimaDe,
      });
      if (r.modo === "cancelado") {
        toast.info("Compartilhamento cancelado.");
        return;
      }
      const id = await registrarDisparo({
        escopoTipo: escopo,
        escopoId: valorEscopo === TODOS ? escopoId : valorEscopo,
        modo: r.modo === "link" ? "link" : "nativo",
        numero: numeroEfetivo,
        status: "compartilhamento_iniciado",
        qtdFotos: selecionados.length,
      });
      setDisparoId(id);
      toast.success("Compartilhamento iniciado — confirme depois que o envio ocorrer.");
    } catch (e: any) {
      await registrarDisparo({
        escopoTipo: escopo,
        escopoId,
        modo: "nativo",
        numero: numeroEfetivo,
        status: "falha",
        qtdFotos: selecionados.length,
        erro: e?.message ?? String(e),
      });
      toast.error("Não foi possível abrir o compartilhamento.");
    } finally {
      setEnviando(false);
    }
  }

  async function baixarPdf() {
    try {
      const file = await gerarPdfResumo(resumo, selecionados);
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Não foi possível gerar o PDF resumido.");
    }
  }

  async function enviarOficial() {
    if (!numeroEfetivo) {
      toast.error("Selecione um número administrativo.");
      return;
    }
    setEnviando(true);
    try {
      const r = await enviarPelaCloudApi({
        destinatario: numeroEfetivo,
        mensagem,
        imagens: selecionados.slice(0, 10).map((i) => i.url),
        escopoTipo: escopo,
        escopoId: valorEscopo === TODOS ? escopoId : valorEscopo,
        idempotencyKey: `${resumo.data}:${escopo}:${valorEscopo}:${selecionados.length}`,
      });
      toast.success(
        r.sandbox ? "Teste concluído (ambiente sandbox)." : "Envio oficial registrado na fila.",
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no envio oficial.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar evidências ao WhatsApp</DialogTitle>
          <DialogDescription>
            {selecionados.length} de {itens.length} evidência(s). O histórico continua no sistema
            independentemente do envio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Escopo</Label>
              <Select
                value={escopo}
                onValueChange={(v) => {
                  setEscopo(v as EscopoTipo);
                  setValorEscopo(TODOS);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rota">Rota inteira</SelectItem>
                  <SelectItem value="predio">Prédio</SelectItem>
                  <SelectItem value="parada">Parada</SelectItem>
                  <SelectItem value="selecao">Fotos selecionadas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {escopo === "predio" || escopo === "parada" ? (
              <div className="space-y-1">
                <Label>{escopo === "predio" ? "Prédio" : "Parada"}</Label>
                <Select value={valorEscopo} onValueChange={setValorEscopo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Todos</SelectItem>
                    {(escopo === "predio" ? predios : paradas).map((v) => (
                      <SelectItem key={v} value={v}>
                        {v || "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Número administrativo salvo</Label>
              <Select value={numeroSalvo} onValueChange={setNumeroSalvo}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Nenhum / digitar</SelectItem>
                  {cfg.numeros.map((n) => (
                    <SelectItem key={n.numero} value={n.numero}>
                      {/* Número mascarado para quem não tem permissão de gestão. */}
                      {n.label} — {gestor ? n.numero : mascararTelefone(n.numero)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {numeroSalvo === TODOS ? (
              <div className="space-y-1">
                <Label htmlFor="wa-num">Outro número (opcional)</Label>
                <Input
                  id="wa-num"
                  inputMode="tel"
                  placeholder="5511999999999"
                  value={numeroManual}
                  onChange={(e) => setNumeroManual(e.target.value)}
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="wa-msg">Mensagem</Label>
            <Textarea id="wa-msg" readOnly rows={10} value={mensagem} className="text-xs" />
            {usaPdf ? (
              <p className="text-xs text-muted-foreground">
                Muitas evidências: será compartilhado um PDF resumido único em vez de dezenas de
                fotos.
              </p>
            ) : null}
          </div>

          {disparoId ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={async () => {
                await confirmarDisparo(disparoId);
                toast.success("Envio confirmado no histórico.");
                setDisparoId(null);
              }}
            >
              Confirmar que o envio foi concluído
            </Button>
          ) : null}

          {cfg.cloud.habilitado && cfg.cloud.validado && gestor ? (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              disabled={enviando}
              onClick={enviarOficial}
            >
              <Send className="mr-1.5 h-4 w-4" />
              Enviar pela API oficial {cfg.cloud.sandbox ? "(sandbox)" : ""}
            </Button>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={async () => {
              const ok = await copiarMensagem(mensagem);
              toast[ok ? "success" : "error"](
                ok ? "Mensagem copiada." : "Não foi possível copiar.",
              );
            }}
          >
            <Copy className="mr-1.5 h-4 w-4" /> Copiar
          </Button>
          <Button variant="outline" onClick={baixarPdf} disabled={selecionados.length === 0}>
            <FileText className="mr-1.5 h-4 w-4" /> PDF resumido
          </Button>
          <Button variant="outline" disabled={enviando} onClick={() => compartilhar(false)}>
            <MessageCircle className="mr-1.5 h-4 w-4" /> Enviar por links
          </Button>
          <Button disabled={enviando || selecionados.length === 0} onClick={() => compartilhar(true)}>
            {enviando ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Share2 className="mr-1.5 h-4 w-4" />
            )}
            Compartilhar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
