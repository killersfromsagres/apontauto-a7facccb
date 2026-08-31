import { useEffect, useMemo, useState } from "react";
import { Loader2, Minus, Package, Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type EditableMaterialRequest = {
  id: string;
  origem: "refrigeracao" | "corretiva";
  descricao?: string | null;
  quantidade?: number | null;
  os_id?: string | null;
};

type MaterialRequestEditDialogProps = {
  request: EditableMaterialRequest | null;
  open: boolean;
  osNumber?: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (request: EditableMaterialRequest) => void;
};

const MAX_QUANTITY = 9999;

export function validateMaterialRequestEdit(description: string, quantity: number) {
  const normalizedDescription = description.trim().replace(/\s+/g, " ");
  const normalizedQuantity = Math.trunc(Number(quantity));

  if (normalizedDescription.length < 3) {
    return { valid: false as const, message: "Informe uma descrição com pelo menos 3 caracteres." };
  }

  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity < 1 || normalizedQuantity > MAX_QUANTITY) {
    return { valid: false as const, message: `A quantidade deve estar entre 1 e ${MAX_QUANTITY}.` };
  }

  return {
    valid: true as const,
    description: normalizedDescription,
    quantity: normalizedQuantity,
  };
}

export function MaterialRequestEditDialog({
  request,
  open,
  osNumber,
  onOpenChange,
  onSaved,
}: MaterialRequestEditDialogProps) {
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!request || !open) return;
    setDescription(request.descricao || "");
    setQuantity(Math.max(1, Number(request.quantidade || 1)));
  }, [request, open]);

  const dirty = useMemo(() => {
    if (!request) return false;
    return (
      description.trim() !== String(request.descricao || "").trim() ||
      quantity !== Math.max(1, Number(request.quantidade || 1))
    );
  }, [description, quantity, request]);

  const changeQuantity = (delta: number) => {
    setQuantity((current) => Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(current || 1) + delta)));
  };

  const save = async () => {
    if (!request || saving) return;

    const validation = validateMaterialRequestEdit(description, quantity);
    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        descricao: validation.description,
        quantidade: validation.quantity,
      };

      const result =
        request.origem === "refrigeracao"
          ? await supabase.from("refrigeracao_pecas").update(payload).eq("id", request.id).select("id, descricao, quantidade").single()
          : await supabase.from("corretiva_pecas").update(payload).eq("id", request.id).select("id, descricao, quantidade").single();

      if (result.error) throw result.error;
      if (!result.data) throw new Error("A solicitação atualizada não foi retornada pelo banco de dados.");

      const updated: EditableMaterialRequest = {
        ...request,
        descricao: result.data.descricao,
        quantidade: result.data.quantidade,
      };

      onSaved(updated);
      toast.success("Solicitação de material atualizada com sucesso.");
      onOpenChange(false);
    } catch (error: any) {
      console.error("[MaterialRequestEdit] Falha ao atualizar solicitação:", error);
      toast.error(error?.message ? `Não foi possível salvar: ${error.message}` : "Não foi possível salvar a solicitação.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !saving && onOpenChange(nextOpen)}>
      <DialogContent className="max-w-lg overflow-hidden border-white/10 bg-[#0b1017]/95 p-0 shadow-2xl backdrop-blur-2xl">
        <div className="border-b border-white/10 bg-gradient-to-br from-emerald-500/15 via-cyan-500/5 to-transparent px-6 py-5">
          <DialogHeader>
            <div className="mb-2 flex items-center gap-2">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-2 text-emerald-300">
                <Package className="h-5 w-5" />
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wide",
                  request?.origem === "refrigeracao"
                    ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
                    : "border-orange-500/30 bg-orange-500/10 text-orange-300",
                )}
              >
                {request?.origem === "refrigeracao" ? "Refrigeração" : "Corretiva"}
              </Badge>
              <Badge variant="secondary" className="font-mono text-[10px]">
                OS {osNumber || "—"}
              </Badge>
            </div>
            <DialogTitle className="text-xl">Editar solicitação de material</DialogTitle>
            <DialogDescription>
              Ajuste somente os dados do material. Informações da OS, equipe e localização permanecem vinculadas ao chamado original.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="space-y-2">
            <Label htmlFor="material-description" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Descrição do material
            </Label>
            <Input
              id="material-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving}
              autoFocus
              maxLength={300}
              className="h-12 border-white/10 bg-white/5 text-base focus-visible:ring-emerald-500/40"
              placeholder="Ex.: Lâmpada LED 18W"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Use uma descrição objetiva para facilitar a compra.</span>
              <span>{description.length}/300</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="material-quantity" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Quantidade
            </Label>
            <div className="flex items-stretch overflow-hidden rounded-xl border border-white/10 bg-white/5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={saving || quantity <= 1}
                onClick={() => changeQuantity(-1)}
                className="h-12 w-12 shrink-0 rounded-none border-r border-white/10 hover:bg-white/10"
                aria-label="Diminuir quantidade"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id="material-quantity"
                type="number"
                min={1}
                max={MAX_QUANTITY}
                step={1}
                value={quantity}
                disabled={saving}
                onChange={(event) => setQuantity(Math.min(MAX_QUANTITY, Math.max(1, Number(event.target.value) || 1)))}
                className="h-12 flex-1 rounded-none border-0 bg-transparent text-center text-lg font-black shadow-none focus-visible:ring-0"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={saving || quantity >= MAX_QUANTITY}
                onClick={() => changeQuantity(1)}
                className="h-12 w-12 shrink-0 rounded-none border-l border-white/10 hover:bg-white/10"
                aria-label="Aumentar quantidade"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className={cn(
            "rounded-xl border px-4 py-3 text-xs transition-colors",
            dirty
              ? "border-amber-500/20 bg-amber-500/10 text-amber-100"
              : "border-white/5 bg-white/[0.03] text-muted-foreground",
          )}>
            {dirty ? "Existem alterações ainda não salvas." : "A solicitação está igual ao registro salvo."}
          </div>
        </div>

        <DialogFooter className="border-t border-white/10 bg-black/10 px-6 py-4 sm:justify-between">
          <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="min-w-36 gap-2 bg-emerald-600 text-white shadow-lg shadow-emerald-950/20 hover:bg-emerald-500"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
