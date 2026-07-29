import { useMemo, useState } from "react";
import { Copy, Loader2, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  compartilharEvidencias,
  confirmarDisparo,
  copiarMensagem,
  montarMensagem,
  registrarDisparo,
  type EvidenciaItem,
  type ResumoRota,
} from "@/lib/agua/whatsapp";

/**
 * Modo padrão do item 11: compartilhamento nativo (Web Share API) com fallback
 * por links. O sistema nunca marca como "entregue" — apenas registra o
 * compartilhamento iniciado e permite a confirmação manual do usuário.
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
  escopoTipo?: "rota" | "predio" | "parada" | "selecao";
  escopoId?: string | null;
}) {
  const [numero, setNumero] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [disparoId, setDisparoId] = useState<string | null>(null);

  const mensagem = useMemo(() => montarMensagem(resumo, itens), [resumo, itens]);

  async function compartilhar(preferirArquivos: boolean) {
    setEnviando(true);
    try {
      const r = await compartilharEvidencias({
        resumo,
        itens,
        numero: numero || null,
        preferirArquivos,
      });
      if (r.modo === "cancelado") {
        toast.info("Compartilhamento cancelado.");
        return;
      }
      const id = await registrarDisparo({
        escopoTipo,
        escopoId,
        modo: r.modo === "link" ? "link" : "nativo",
        numero: numero || null,
        status: "compartilhamento_iniciado",
        qtdFotos: itens.length,
      });
      setDisparoId(id);
      toast.success("Compartilhamento iniciado — confirme depois que o envio ocorrer.");
    } catch (e: any) {
      await registrarDisparo({
        escopoTipo,
        escopoId,
        modo: "nativo",
        numero: numero || null,
        status: "falha",
        qtdFotos: itens.length,
        erro: e?.message ?? String(e),
      });
      toast.error("Não foi possível abrir o compartilhamento.");
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
            {itens.length} evidência(s) selecionada(s). O histórico continua disponível no sistema
            independentemente do envio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="wa-num">Número administrativo (opcional)</Label>
            <Input
              id="wa-num"
              inputMode="tel"
              placeholder="5511999999999"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="wa-msg">Mensagem</Label>
            <Textarea id="wa-msg" readOnly rows={10} value={mensagem} className="text-xs" />
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
          <Button variant="outline" disabled={enviando} onClick={() => compartilhar(false)}>
            <MessageCircle className="mr-1.5 h-4 w-4" /> Enviar por links
          </Button>
          <Button disabled={enviando || itens.length === 0} onClick={() => compartilhar(true)}>
            {enviando ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Share2 className="mr-1.5 h-4 w-4" />
            )}
            Compartilhar fotos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
