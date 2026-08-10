import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Package, CheckCircle2, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { equipeStyles } from "@/lib/corretiva/equipe";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OsDetailsDialogProps {
  os: any;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export function OsDetailsDialog({ os, isOpen, onClose, onUpdate }: OsDetailsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [pecas, setPecas] = useState(os.pecas_solicitadas || "");
  const [observacao, setObservacao] = useState(os.observacao_conclusao || "");

  const handleFinish = async (withPhoto: boolean) => {
    if (withPhoto && !photo) {
      toast.error("Por favor, adicione uma foto para concluir.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("corretiva_os")
        .update({
          status: "concluida",
          foto_conclusao: photo,
          observacao_conclusao: observacao,
          pecas_solicitadas: pecas,
          data_conclusao: new Date().toISOString()
        } as any)
        .eq("id", os.id);

      if (error) throw error;

      toast.success("OS concluída com sucesso!");
      onUpdate();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao concluir OS.");
    } finally {
      setLoading(false);
    }
  };

  const handleSolicitarPeca = async () => {
    if (!pecas) {
      toast.error("Descreva as peças necessárias.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from("corretiva_os")
        .update({ pecas_solicitadas: pecas } as any)
        .eq("id", os.id);

      if (error) throw error;
      toast.success("Solicitação de peça registrada.");
    } catch (err) {
      toast.error("Erro ao solicitar peças.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-[calc(100%-1.5rem)] md:w-full h-auto max-h-[90vh] rounded-3xl overflow-hidden p-0 gap-0 border-white/10 bg-[#0A0A0A] shadow-2xl z-[9999]">
        <div className="flex flex-col h-full max-h-[90vh] overflow-hidden bg-[#0A0A0A]">
          <div className="p-6 pb-32 space-y-6 flex-1 overflow-y-auto custom-scrollbar bg-[#0A0A0A]">
            <DialogHeader className="text-left">
              <div className="flex items-center justify-between mb-3">
                <Badge variant="outline" className={cn("font-mono text-[10px]", equipeStyles(os.equipe).badge)}>
                  OS {os.numero_os}
                </Badge>
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                  {os.status}
                </Badge>
              </div>
              <DialogTitle className="text-xl font-bold leading-tight text-white">
                {os.nome_os || "Sem descrição"}
              </DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4 text-sm bg-white/5 p-4 rounded-2xl border border-white/5">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase opacity-50 font-bold tracking-tighter">Localização</Label>
                <p className="font-semibold text-white">{os.predio} - {os.andar}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{os.local}</p>
              </div>
              <div className="space-y-1 text-right">
                <Label className="text-[10px] uppercase opacity-50 font-bold tracking-tighter">Equipe</Label>
                <p className={cn("font-bold text-primary")}>
                  {os.equipe || "Não definida"}
                </p>
                <p className="text-[10px] text-muted-foreground italic">Solicitante: {os.solicitante || "-"}</p>
                {os.data_criacao && (
                  <p className="text-[10px] text-primary font-medium mt-1">
                    Abertura: {new Date(os.data_criacao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-white/70">Solicitar Peças / Materiais</Label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Ex: Lâmpada LED 9W..." 
                    value={pecas}
                    onChange={(e) => setPecas(e.target.value)}
                    className="bg-white/5 border-white/10 h-11 text-sm focus:ring-primary/50 text-white"
                  />
                  <Button 
                    variant="glass" 
                    size="icon" 
                    className="h-11 w-11 shrink-0" 
                    onClick={handleSolicitarPeca}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4 text-white" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-white/70">Observações de Campo</Label>
                <Textarea 
                  placeholder="Relate o que foi feito no local..."
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="bg-white/5 border-white/10 min-h-[90px] text-sm focus:ring-primary/50 resize-none text-white"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold text-white/70">Evidência Fotográfica</Label>
                {photo ? (
                  <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/10 group">
                    <img src={photo} alt="Evidência" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        className="rounded-full gap-2"
                        onClick={() => setPhoto(null)}
                      >
                        <X className="h-4 w-4" /> Remover
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button 
                    variant="glass" 
                    className="w-full h-28 border-dashed border-2 border-white/10 hover:border-primary/50 gap-3 flex-col rounded-2xl bg-white/2 transition-all"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.capture = 'environment';
                      input.onchange = (e: any) => {
                        const file = e.target.files[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (re) => setPhoto(re.target?.result as string);
                          reader.readAsDataURL(file);
                        }
                      };
                      input.click();
                    }}
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Camera className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground text-white">Tirar foto ou anexar</span>
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 p-6 border-t border-white/10 bg-[#0A0A0A] sticky bottom-0 left-0 right-0 z-[10000]">
            {os?.isAdmin && (
              <Button 
                variant="outline" 
                className="h-12 rounded-xl text-xs font-bold border-white/10 bg-white/5 hover:bg-white/10 text-white" 
                disabled={loading}
                onClick={() => handleFinish(false)}
              >
                Concluir s/ Foto (Admin)
              </Button>
            )}
            <Button 
              variant="default" 
              className={cn(
                "h-12 rounded-xl text-xs font-bold gap-2 shadow-lg shadow-primary/20",
                os?.isAdmin ? "" : "col-span-2",
                !photo && !os?.isAdmin && "opacity-50"
              )} 
              disabled={loading || (!photo && !os?.isAdmin)}
              onClick={() => handleFinish(true)}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Finalizar c/ Foto
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
