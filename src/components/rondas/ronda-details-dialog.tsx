import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Camera, ImageIcon, Loader2, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { updateRonda } from "@/lib/rondas/rondas.functions";
import { RondaCalha } from "@/lib/rondas/types";

interface RondaDetailsDialogProps {
  ronda: RondaCalha;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

type PhotoSection = "antes" | "depois";

export function RondaDetailsDialog({ ronda, isOpen, onClose, onUpdate }: RondaDetailsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [realizadoPor, setRealizadoPor] = useState("");
  const [problemas, setProblemas] = useState("");
  const [fotosAntes, setFotosAntes] = useState<string[]>([]);
  const [fotosDepois, setFotosDepois] = useState<string[]>([]);
  const updateRondaFn = useServerFn(updateRonda);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, section: PhotoSection) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("image", file);
    formData.append("module", "rondas-calhas");
    formData.append("entity_type", "ronda");
    formData.append("entity_id", ronda.id);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/imgbb-upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session?.access_token || ""}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Erro desconhecido no servidor" }));
        throw new Error(errorData.error || `Erro HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.url) {
        if (section === "antes") {
          setFotosAntes((prev) => [...prev, data.url]);
        } else {
          setFotosDepois((prev) => [...prev, data.url]);
        }
        toast.success(`Foto "${section}" anexada com sucesso!`);
      } else {
        toast.error(`Erro ao fazer upload: ${data.error || "URL não retornada"}.`);
      }
    } catch (err) {
      toast.error("Erro ao fazer upload da imagem.");
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async () => {
    if (!realizadoPor.trim()) return toast.error("Informe quem realizou a ronda.");
    if (fotosAntes.length === 0) return toast.error("Anexe pelo menos uma foto de ANTES.");
    if (fotosDepois.length === 0) return toast.error("Anexe pelo menos uma foto de DEPOIS.");

    setLoading(true);
    try {
      await updateRondaFn({
        data: {
          id: ronda.id,
          realizado_por: realizadoPor,
          problemas_identificados: problemas,
          fotos_antes: fotosAntes,
          fotos_depois: fotosDepois,
          // Mantendo 'fotos' como união para compatibilidade com histórico atual se necessário
          fotos: [...fotosAntes, ...fotosDepois],
        },
      });
      toast.success("Ronda concluída!");
      onUpdate();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao concluir ronda.");
    } finally {
      setLoading(false);
    }
  };

  const PhotoUploadSection = ({ title, section, currentFotos, setFotos }: { 
    title: string, 
    section: PhotoSection, 
    currentFotos: string[], 
    setFotos: React.Dispatch<React.SetStateAction<string[]>> 
  }) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-white/70">{title} ({currentFotos.length})</Label>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-16 flex-col gap-1 border-dashed border-white/20 hover:bg-white/5 relative rounded-xl">
          <Camera className="h-5 w-5" />
          <span className="text-[10px]">Câmera</span>
          <Input 
            type="file" 
            accept="image/*" 
            capture="environment" 
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => handleUpload(e, section)}
            disabled={loading}
          />
        </Button>
        <Button variant="outline" className="h-16 flex-col gap-1 border-dashed border-white/20 hover:bg-white/5 relative rounded-xl">
          <ImageIcon className="h-5 w-5" />
          <span className="text-[10px]">Galeria</span>
          <Input 
            type="file" 
            accept="image/*" 
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => handleUpload(e, section)}
            disabled={loading}
          />
        </Button>
      </div>
      {currentFotos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto py-2 scrollbar-hide">
          {currentFotos.map((url, i) => (
            <div key={i} className="relative group shrink-0">
              <img 
                src={url} 
                alt={`${title} Evidência`} 
                className="w-16 h-16 object-cover rounded-xl border border-white/10 shadow-lg" 
              />
              <button
                onClick={() => setFotos(prev => prev.filter((_, idx) => idx !== i))}
                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 shadow-xl hover:bg-red-600 transition-colors"
              >
                <X className="h-2 w-2" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-[#0A0A0A] border-white/10 text-white rounded-3xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Realizar Ronda: {ronda.predio}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Responsável pela Ronda</Label>
            <Input 
              placeholder="Nome completo" 
              value={realizadoPor}
              onChange={(e) => setRealizadoPor(e.target.value)}
              className="bg-white/5 border-white/10 h-11 rounded-xl"
            />
          </div>
          
          <div className="space-y-2">
            <Label>Problemas Identificados</Label>
            <Textarea 
              placeholder="Descreva eventuais problemas na calha..." 
              value={problemas}
              onChange={(e) => setProblemas(e.target.value)}
              className="bg-white/5 border-white/10 min-h-[80px] rounded-xl"
            />
          </div>

          <div className="space-y-6">
            <PhotoUploadSection 
              title="Fotos de ANTES" 
              section="antes" 
              currentFotos={fotosAntes} 
              setFotos={setFotosAntes} 
            />

            <PhotoUploadSection 
              title="Fotos de DEPOIS" 
              section="depois" 
              currentFotos={fotosDepois} 
              setFotos={setFotosDepois} 
            />
          </div>

          <Button 
            className="w-full h-12 bg-primary hover:bg-primary/90 rounded-2xl gap-2 font-bold mt-4" 
            onClick={handleFinish} 
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Concluir Ronda
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
